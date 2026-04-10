import fs from 'fs'
import path from 'path'
import { anthropic, MODELS } from '../anthropic'
import { readFile, writeFile, storagePath } from '../utils/storage'
import { storeMessage, fetchMessages } from '../utils/messages'
import { getServiceClient } from '../supabase'

type SkillEmit = (event:
  | { type: 'token'; content: string }
  | { type: 'error'; code: string; message: string }
) => void

export type JDMatchTurn1Result =
  | { success: true; arcText: string }
  | { success: false; code: string; message: string }

export type JDMatchTurn2Result =
  | { success: true; assessmentText: string; verdict: string; hard_req_status: string; arc_alignment: string; key_factors: string }
  | { success: false; code: string; message: string }

function parseVerdictBlock(text: string) {
  const get = (field: string) => {
    const match = text.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'))
    return match?.[1]?.trim() ?? ''
  }
  return {
    verdict: get('verdict'),
    hard_req_status: get('hard_req_status'),
    arc_alignment: get('arc_alignment'),
    key_factors: get('key_factors'),
  }
}

export async function runJDMatchTurn1(
  sessionId: string,
  userId: string,
  emit: SkillEmit
): Promise<JDMatchTurn1Result> {
  let decodedJD: string, resumeStructured: string
  try {
    decodedJD = await readFile(userId, sessionId, 'decoded_jd.md')
    resumeStructured = await readFile(userId, sessionId, 'resume_structured.json')
  } catch {
    return { success: false, code: 'STORAGE_ERROR', message: 'Couldn\'t load required context. Please start a new session.' }
  }

  const skillText = fs.readFileSync(path.join(process.cwd(), 'skills', 'jd-match.md'), 'utf-8')
  const system = `${skillText}

---
TURN 1 INSTRUCTION: Execute Steps 1 and 2 ONLY.
- Extract Sections 10 and 11 from the decoded JD (internal, do not print)
- Print the resume arc snapshot (3–5 bullets)
- Ask the confirmation question
- STOP. Do not proceed to Steps 3–6. Do not run the hard requirements check or verdict.`

  const userMsg = `decoded_jd: ${decodedJD}\nresume: ${resumeStructured}\nsession_id: ${sessionId}\nuser_id: ${userId}`

  let arcText = ''
  try {
    const stream = anthropic.messages.stream({
      model: MODELS.analysis,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: userMsg }],
    })
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        emit({ type: 'token', content: chunk.delta.text })
        arcText += chunk.delta.text
      }
    }
  } catch (err: unknown) {
    const status = (err as { status?: number }).status
    if (status === 429) return { success: false, code: 'RATE_LIMITED', message: 'The AI service is busy — wait a moment and try again.' }
    return { success: false, code: 'API_ERROR', message: 'The analysis failed. Please try again.' }
  }

  await storeMessage(sessionId, 'user', userMsg, 'resume_loaded')
  await storeMessage(sessionId, 'assistant', arcText, 'resume_loaded')

  return { success: true, arcText }
}

export async function runJDMatchTurn2(
  sessionId: string,
  userId: string,
  userResponse: string,
  emit: SkillEmit
): Promise<JDMatchTurn2Result> {
  const history = await fetchMessages(sessionId, 'resume_loaded')

  if (history.filter(m => m.role === 'assistant').length === 0) {
    return { success: false, code: 'MISSING_HISTORY', message: 'MISSING_HISTORY' }
  }

  const skillText = fs.readFileSync(path.join(process.cwd(), 'skills', 'jd-match.md'), 'utf-8')
  const system = `decoded_jd context already provided in conversation.\n\n${skillText}`
  const allMessages = [...history, { role: 'user' as const, content: userResponse }]

  let assessmentText = ''
  try {
    const stream = anthropic.messages.stream({
      model: MODELS.analysis,
      max_tokens: 8096,
      system,
      messages: allMessages,
    })
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        emit({ type: 'token', content: chunk.delta.text })
        assessmentText += chunk.delta.text
      }
    }
  } catch (err: unknown) {
    const status = (err as { status?: number }).status
    if (status === 429) return { success: false, code: 'RATE_LIMITED', message: 'The AI service is busy — wait a moment and try again.' }
    return { success: false, code: 'API_ERROR', message: 'The assessment failed. Please try again.' }
  }

  const parsed = parseVerdictBlock(assessmentText)

  try {
    await writeFile(userId, sessionId, 'fit_assessment.md', assessmentText, 'text/markdown')
  } catch {
    return { success: false, code: 'UPLOAD_FAILED', message: 'Failed to save the assessment. Please try again.' }
  }

  const supabase = getServiceClient()
  const filePath = storagePath(userId, sessionId, 'fit_assessment.md')
  await supabase.from('files').insert({ session_id: sessionId, user_id: userId, file_type: 'fit_assessment', storage_path: filePath })
  await supabase.from('events').insert({ session_id: sessionId, user_id: userId, event: 'verdict_delivered' })
  await storeMessage(sessionId, 'assistant', assessmentText, 'resume_loaded')

  return { success: true, assessmentText, ...parsed }
}
