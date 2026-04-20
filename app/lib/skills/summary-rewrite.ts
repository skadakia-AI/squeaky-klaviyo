import fs from 'fs'
import path from 'path'
import { anthropic, MODELS } from '../anthropic'
import { readFile, writeFile, storagePath } from '../utils/storage'
import { getServiceClient } from '../supabase'
import type { Resume } from '../types'

export type SummaryRewriteResult =
  | { success: true; original: string | null; rewritten: string }
  | { success: false; code: string; message: string }

export async function runSummaryRewrite(
  sessionId: string,
  userId: string
): Promise<SummaryRewriteResult> {
  let decodedJD: string, resumeStructured: string
  try {
    decodedJD = await readFile(userId, sessionId, 'decoded_jd.md')
    resumeStructured = await readFile(userId, sessionId, 'resume_structured.json')
  } catch {
    return { success: false, code: 'STORAGE_ERROR', message: 'Couldn\'t load required context for summary rewrite.' }
  }

  let fitAssessment = ''
  try {
    fitAssessment = await readFile(userId, sessionId, 'fit_assessment.md')
  } catch {
    console.error('[summary-rewrite] fit_assessment.md not found, session:', sessionId)
  }

  const resume: Resume = JSON.parse(resumeStructured)
  const original = resume.summary ?? null

  const skillText = fs.readFileSync(path.join(process.cwd(), 'skills', 'summary-rewrite.md'), 'utf-8')
  const userMsg = `decoded_jd: ${decodedJD}\nfit_assessment: ${fitAssessment}\nresume: ${resumeStructured}`

  let rewritten: string
  try {
    const response = await anthropic.messages.create({
      model: MODELS.analysis,
      max_tokens: 512,
      system: skillText,
      messages: [{ role: 'user', content: userMsg }],
    })
    rewritten = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
  } catch (err: unknown) {
    const status = (err as { status?: number }).status
    if (status === 429) return { success: false, code: 'RATE_LIMITED', message: 'The AI service is busy — wait a moment and try again.' }
    return { success: false, code: 'API_ERROR', message: 'Summary rewrite failed. Please try again.' }
  }

  if (!rewritten) {
    return { success: false, code: 'EMPTY_RESPONSE', message: 'Summary rewrite returned no content.' }
  }

  try {
    await writeFile(userId, sessionId, 'summary_rewrite.json', JSON.stringify({ original, rewritten }, null, 2), 'application/json')
  } catch {
    return { success: false, code: 'UPLOAD_FAILED', message: 'Failed to save summary rewrite.' }
  }

  const supabase = getServiceClient()
  const filePath = storagePath(userId, sessionId, 'summary_rewrite.json')
  await supabase.from('files').insert({ session_id: sessionId, user_id: userId, file_type: 'summary_rewrite', storage_path: filePath })

  return { success: true, original, rewritten }
}
