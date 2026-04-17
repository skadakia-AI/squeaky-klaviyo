import mammoth from 'mammoth'
import { getServiceClient } from '../supabase'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (buf: Buffer) => Promise<{ text: string }>
import { anthropic, MODELS } from '../anthropic'
import type { Resume } from '../types'

type LoadResumeInput = {
  type: 'pdf' | 'docx' | 'txt' | 'text'
  content: string       // base64-encoded bytes for pdf/docx, plain text for txt/text
  sessionId: string
  userId: string
}

type LoadResumeResult =
  | { success: true; rawText: string; resume: Resume; short: boolean }
  | { success: false; error: string; message: string }

async function isResume(text: string): Promise<boolean> {
  try {
    const response = await anthropic.messages.create({
      model: MODELS.parsing,
      max_tokens: 5,
      messages: [{
        role: 'user',
        content: `Is the following text a resume or CV listing someone's work experience? Answer only YES or NO. If uncertain, answer YES.\n\n${text.slice(0, 3000)}`,
      }],
    })
    const answer = response.content[0].type === 'text' ? response.content[0].text.trim().toUpperCase() : 'YES'
    return !answer.startsWith('NO')
  } catch {
    return true // fail open — don't block valid users on API errors
  }
}

export async function loadResume(input: LoadResumeInput): Promise<LoadResumeResult> {
  let rawText = ''

  // ── 1. Extract raw text ──────────────────────────────────────────────────
  if (input.type === 'pdf') {
    try {
      const buffer = Buffer.from(input.content, 'base64')
      const data = await pdfParse(buffer)
      rawText = data.text
    } catch {
      return { success: false, error: 'PARSE_FAILED', message: 'Couldn\'t read that PDF. Try pasting your resume text directly.' }
    }

  } else if (input.type === 'docx') {
    try {
      const buffer = Buffer.from(input.content, 'base64')
      const result = await mammoth.extractRawText({ buffer })
      rawText = result.value
    } catch {
      return { success: false, error: 'PARSE_FAILED', message: 'Couldn\'t read that Word document. Try pasting your resume text directly.' }
    }

  } else {
    rawText = input.content
  }

  rawText = rawText.trim()

  if (!rawText) {
    return { success: false, error: 'EMPTY_CONTENT', message: 'No content was extracted from your resume. Try pasting the text directly.' }
  }

  const lineCount = rawText.split('\n').filter(l => l.trim()).length
  const short = lineCount < 20

  const resumeCheck = await isResume(rawText)
  if (!resumeCheck) {
    return { success: false, error: 'NOT_A_RESUME', message: "That doesn't look like a resume. Try uploading your resume PDF, Word document, or pasting it as text." }
  }

  // ── 2. Call Haiku for structured extraction ──────────────────────────────
  const extractionPrompt = `Extract the following resume text into a structured JSON object matching this TypeScript schema exactly:

interface Resume {
  name: string
  email?: string
  phone?: string
  location?: string
  linkedin?: string
  website?: string
  summary?: string
  experience: Role[]
  education: Education[]
  skills?: string[]
  other?: Section[]
}

interface Role {
  id: string        // assign sequential IDs: "r0", "r1", "r2", etc.
  company: string
  title: string
  location?: string
  start_date?: string
  end_date?: string  // use "Present" if current
  description?: string
  bullets: Bullet[]
}

interface Bullet {
  id: string   // format: "r{role_index}-b{bullet_index}" e.g. "r0-b0", "r0-b1", "r1-b0"
  text: string
}

interface Education {
  institution: string
  degree?: string
  field?: string
  location?: string
  dates?: string
  notes?: string[]
}

interface Section {
  title: string
  content: string
}

Rules:
- Assign IDs sequentially starting at r0 for experience, and r{i}-b{j} for bullets
- Extract ALL bullet points as separate Bullet objects
- Preserve original bullet text exactly — do not paraphrase or improve
- If a field is absent, omit it (do not include null)
- Return ONLY the JSON object, no explanation, no markdown code blocks

Resume text:
${rawText}`

  let resume: Resume
  try {
    const response = await anthropic.messages.create({
      model: MODELS.parsing,
      max_tokens: 4096,
      messages: [{ role: 'user', content: extractionPrompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    // Strip any accidental markdown fences
    const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    resume = JSON.parse(cleaned)
  } catch (err) {
    console.error('[load-resume] Haiku extraction error:', err)
    return { success: false, error: 'EXTRACTION_FAILED', message: 'Couldn\'t parse your resume structure. Try pasting it as plain text.' }
  }

  // ── 3. Write to storage ──────────────────────────────────────────────────
  const supabase = getServiceClient()
  const basePath = `users/${input.userId}/${input.sessionId}`

  const [rawUpload, jsonUpload] = await Promise.all([
    supabase.storage.from('squeaky').upload(
      `${basePath}/resume_main.md`, rawText,
      { contentType: 'text/markdown', upsert: true }
    ),
    supabase.storage.from('squeaky').upload(
      `${basePath}/resume_structured.json`, JSON.stringify(resume, null, 2),
      { contentType: 'application/json', upsert: true }
    ),
  ])

  if (rawUpload.error || jsonUpload.error) {
    console.error('[load-resume] storage error:', rawUpload.error?.message ?? jsonUpload.error?.message)
    return { success: false, error: 'UPLOAD_FAILED', message: 'Failed to save your resume. Please try again.' }
  }

  await Promise.all([
    supabase.from('files').insert([
      { session_id: input.sessionId, user_id: input.userId, file_type: 'resume_main', storage_path: `${basePath}/resume_main.md` },
      { session_id: input.sessionId, user_id: input.userId, file_type: 'resume_structured', storage_path: `${basePath}/resume_structured.json` },
    ]),
    supabase.from('events').insert({
      session_id: input.sessionId,
      user_id: input.userId,
      event: 'resume_uploaded',
    }),
  ])

  return { success: true, rawText, resume, short }
}
