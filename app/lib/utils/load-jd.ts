import { getServiceClient } from '../supabase'
import { anthropic, MODELS } from '../anthropic'
// Import internal lib directly to avoid pdf-parse running its self-test on module load
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (buf: Buffer) => Promise<{ text: string }>

type LoadJDInput = {
  type: 'url' | 'pdf' | 'text'
  content: string       // URL string, base64-encoded PDF bytes, or plain text
  sessionId: string
  userId: string
}

type LoadJDResult =
  | { success: true; rawText: string }
  | { success: false; error: string; message: string }

async function isJobDescription(text: string): Promise<boolean> {
  try {
    const response = await anthropic.messages.create({
      model: MODELS.parsing,
      max_tokens: 5,
      messages: [{
        role: 'user',
        content: `Does the following text contain a job description or job posting for a specific open role? Answer only YES or NO. If uncertain, answer YES.\n\n${text.slice(0, 3000)}`,
      }],
    })
    const answer = response.content[0].type === 'text' ? response.content[0].text.trim().toUpperCase() : 'YES'
    return !answer.startsWith('NO')
  } catch {
    return true // fail open — don't block valid users on API errors
  }
}

export async function loadJD(input: LoadJDInput): Promise<LoadJDResult> {
  let rawText = ''

  // ── 1. Extract text ──────────────────────────────────────────────────────
  if (input.type === 'url') {
    try {
      new URL(input.content)
    } catch {
      return { success: false, error: 'INVALID_URL', message: 'That doesn\'t look like a valid URL. Try pasting the job description text directly.' }
    }

    try {
      const jinaUrl = `https://r.jina.ai/${input.content}`
      const res = await fetch(jinaUrl, {
        headers: { 'Accept': 'text/plain' },
        signal: AbortSignal.timeout(30000),
      })
      rawText = await res.text()
    } catch {
      return { success: false, error: 'FETCH_FAILED', message: 'Couldn\'t fetch that URL — it may require a login or block automated access. Try pasting the job description text directly.' }
    }

  } else if (input.type === 'pdf') {
    try {
      const buffer = Buffer.from(input.content, 'base64')
      const data = await pdfParse(buffer)
      rawText = data.text
    } catch {
      return { success: false, error: 'PARSE_FAILED', message: 'Couldn\'t read that PDF. Try copying and pasting the job description text directly.' }
    }

  } else {
    rawText = input.content
  }

  rawText = rawText.trim()

  if (!rawText) {
    return { success: false, error: 'EMPTY_CONTENT', message: 'No content was extracted. Try pasting the job description text directly.' }
  }

  // ── 2. Validate ──────────────────────────────────────────────────────────
  const isJD = await isJobDescription(rawText)
  if (!isJD) {
    return { success: false, error: 'NOT_A_JD', message: 'That doesn\'t look like a job description. Try pasting the full job posting text, or paste a direct URL to the job listing.' }
  }

  // ── 3. Write to storage ──────────────────────────────────────────────────
  const supabase = getServiceClient()
  const storagePath = `users/${input.userId}/${input.sessionId}/raw_jd.md`

  const { error: uploadError } = await supabase.storage
    .from('squeaky')
    .upload(storagePath, rawText, { contentType: 'text/markdown', upsert: true })

  if (uploadError) {
    console.error('[load-jd] storage upload error:', uploadError.message)
    return { success: false, error: 'UPLOAD_FAILED', message: 'Failed to save the job description. Please try again.' }
  }

  // ── 4. Log event ─────────────────────────────────────────────────────────
  await supabase.from('files').insert({
    session_id: input.sessionId,
    user_id: input.userId,
    file_type: 'raw_jd',
    storage_path: storagePath,
  })

  await supabase.from('events').insert({
    session_id: input.sessionId,
    user_id: input.userId,
    event: 'jd_uploaded',
  })

  return { success: true, rawText }
}
