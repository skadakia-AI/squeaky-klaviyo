import fs from 'fs'
import path from 'path'
import { anthropic, MODELS } from '../anthropic'
import { readFile, writeFile, storagePath } from '../utils/storage'
import { storeMessage, fetchMessages } from '../utils/messages'
import { getServiceClient } from '../supabase'
import type { Resume } from '../types'

type SkillEmit = (event:
  | { type: 'token'; content: string }
  | { type: 'error'; code: string; message: string }
) => void

export type ResumeTargetingTurn1Result =
  | { success: true; turn1Text: string; needsNumbers: boolean }
  | { success: false; code: string; message: string }

export type ResumeTargetingTurn2Result =
  | { success: true; targetingOutput: unknown; bulletCount: number; resume: Resume }
  | { success: false; code: string; message: string }

export async function runResumeTargetingTurn1(
  sessionId: string,
  userId: string,
  scopeIds: string[],
  emit: SkillEmit
): Promise<ResumeTargetingTurn1Result> {
  let decodedJD: string, resumeStructured: string
  try {
    decodedJD = await readFile(userId, sessionId, 'decoded_jd.md')
    resumeStructured = await readFile(userId, sessionId, 'resume_structured.json')
  } catch {
    return { success: false, code: 'STORAGE_ERROR', message: 'Couldn\'t load required context. Please start a new session.' }
  }

  const system = fs.readFileSync(path.join(process.cwd(), 'skills', 'resume-targeting.md'), 'utf-8')
  const userMsg = `decoded_jd: ${decodedJD}\nresume: ${resumeStructured}\nscope: ${JSON.stringify(scopeIds)}\nsession_id: ${sessionId}\nuser_id: ${userId}`

  let turn1Text = ''
  try {
    const stream = anthropic.messages.stream({
      model: MODELS.analysis,
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: userMsg }],
    })
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        emit({ type: 'token', content: chunk.delta.text })
        turn1Text += chunk.delta.text
      }
    }
  } catch (err: unknown) {
    const status = (err as { status?: number }).status
    if (status === 429) return { success: false, code: 'RATE_LIMITED', message: 'The AI service is busy — wait a moment and try again.' }
    return { success: false, code: 'API_ERROR', message: 'The analysis failed. Please try again.' }
  }

  await storeMessage(sessionId, 'user', userMsg, 'assessed')
  await storeMessage(sessionId, 'assistant', turn1Text, 'assessed')

  const needsNumbers = turn1Text.includes('Before I rewrite') || turn1Text.includes('I need a few numbers')
  return { success: true, turn1Text, needsNumbers }
}

export async function runResumeTargetingTurn2(
  sessionId: string,
  userId: string
): Promise<ResumeTargetingTurn2Result> {
  const messages = await fetchMessages(sessionId, 'assessed')
  const system = fs.readFileSync(path.join(process.cwd(), 'skills', 'resume-targeting.md'), 'utf-8')

  let turn2Text: string
  try {
    const response = await anthropic.messages.create({
      model: MODELS.analysis,
      max_tokens: 8096,
      system,
      messages,
    })
    turn2Text = response.content[0].type === 'text' ? response.content[0].text : ''
  } catch (err: unknown) {
    const status = (err as { status?: number }).status
    if (status === 429) return { success: false, code: 'RATE_LIMITED', message: 'The AI service is busy — wait a moment and try again.' }
    return { success: false, code: 'API_ERROR', message: 'The rewriting failed. Please try again.' }
  }

  const jsonMatch = turn2Text.match(/```json\n([\s\S]+?)\n```/) ?? turn2Text.match(/(\{[\s\S]+\})/)
  if (!jsonMatch) {
    return { success: false, code: 'PARSE_ERROR', message: 'Couldn\'t parse targeting output. Please try again.' }
  }

  let targetingOutput: unknown
  try {
    targetingOutput = JSON.parse(jsonMatch[1])
  } catch {
    return { success: false, code: 'PARSE_ERROR', message: 'Couldn\'t parse targeting output. Please try again.' }
  }

  try {
    await writeFile(userId, sessionId, 'targeted_resume.json', JSON.stringify(targetingOutput, null, 2), 'application/json')
  } catch {
    return { success: false, code: 'UPLOAD_FAILED', message: 'Failed to save targeting output. Please try again.' }
  }

  const supabase = getServiceClient()
  const filePath = storagePath(userId, sessionId, 'targeted_resume.json')
  await supabase.from('files').insert({ session_id: sessionId, user_id: userId, file_type: 'targeted_resume', storage_path: filePath })
  await supabase.from('events').insert({ session_id: sessionId, user_id: userId, event: 'resume_targeted' })
  await storeMessage(sessionId, 'assistant', turn2Text, 'assessed')

  const bulletCount = (targetingOutput as { rewrites?: unknown[] }).rewrites?.length ?? 0

  let resume: Resume = { name: '', experience: [], education: [] }
  try {
    resume = JSON.parse(await readFile(userId, sessionId, 'resume_structured.json'))
  } catch {
    console.error('[resume-targeting] could not read resume for diff view, session:', sessionId)
  }

  return { success: true, targetingOutput, bulletCount, resume }
}
