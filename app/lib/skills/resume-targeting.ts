import fs from 'fs'
import path from 'path'
import { anthropic, MODELS } from '../anthropic'
import { readFile, writeFile, storagePath } from '../utils/storage'
import { getServiceClient } from '../supabase'
import { storeMessage, fetchMessages } from '../utils/messages'
import type { Resume } from '../types'

export { parseQuantificationQuestions } from '../utils/parse-quantification'

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

  let fitAssessment = ''
  try {
    fitAssessment = await readFile(userId, sessionId, 'fit_assessment.md')
  } catch {
    console.error('[resume-targeting] fit_assessment.md not found — proceeding without it, session:', sessionId)
  }

  const skillText = fs.readFileSync(path.join(process.cwd(), 'skills', 'resume-targeting.md'), 'utf-8')
  const system = `${skillText}

---
TURN 1 INSTRUCTION: Execute Steps 1, 2, and 3 ONLY.
- Build the strategic objectives map and gap brief internally (do not print)
- Audit all bullets in scope silently (do not print)
- If any bullets need quantification, print the numbers request (Step 3 format) and STOP
- If no numbers are needed, print exactly: "No numbers needed — I'll start rewriting." and STOP
- DO NOT proceed to Steps 4, 5, or 6. No ORIGINAL/REWRITTEN blocks, no JSON output.
- NEVER print bullet IDs (e.g. r0-b0, r1-b2) in any output. Reference bullets by their text only.`
  const userMsg = `decoded_jd: ${decodedJD}\nresume: ${resumeStructured}${fitAssessment ? `\nfit_assessment: ${fitAssessment}` : ''}\nscope: ${JSON.stringify(scopeIds)}\nsession_id: ${sessionId}\nuser_id: ${userId}`

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

  // Detect by absence of the "no numbers" confirmation phrase, which the TURN 1 INSTRUCTION
  // controls exactly. Checking for specific "needs numbers" phrases is fragile since the
  // LLM may vary the phrasing while still correctly asking for numbers.
  const needsNumbers = !turn1Text.includes('No numbers needed')
  return { success: true, turn1Text, needsNumbers }
}

export async function runResumeTargetingTurn2(
  sessionId: string,
  userId: string
): Promise<ResumeTargetingTurn2Result> {
  const messages = await fetchMessages(sessionId, 'assessed')
  const skillText = fs.readFileSync(path.join(process.cwd(), 'skills', 'resume-targeting.md'), 'utf-8')
  const system = `${skillText}

---
TURN 2 INSTRUCTION: Execute Steps 4, 5, and 6 internally, then output ONLY the final JSON.
- Use the conversation history and any numbers the user provided
- Rewrite all bullets in scope, flag removals, run credibility check
- Do NOT print ORIGINAL/REWRITTEN/CHANGES blocks, RECOMMEND CUTTING prose, or credibility check findings — do all of this internally
- Your ENTIRE response must be a single JSON code block (no preamble, no trailing commentary) in the format specified in the Output format section`

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
    console.error('[resume-targeting] Turn 2 parse failed. Raw response:', turn2Text)
    return { success: false, code: 'PARSE_ERROR', message: 'Couldn\'t parse targeting output. Please try again.' }
  }

  let targetingOutput: unknown
  try {
    targetingOutput = JSON.parse(jsonMatch[1])
  } catch {
    return { success: false, code: 'PARSE_ERROR', message: 'Couldn\'t parse targeting output. Please try again.' }
  }

  await storeMessage(sessionId, 'assistant', turn2Text, 'assessed')

  try {
    await writeFile(userId, sessionId, 'targeted_resume.json', JSON.stringify(targetingOutput, null, 2), 'application/json')
  } catch {
    return { success: false, code: 'UPLOAD_FAILED', message: 'Failed to save targeting output. Please try again.' }
  }

  const supabase = getServiceClient()
  const filePath = storagePath(userId, sessionId, 'targeted_resume.json')
  await supabase.from('files').insert({ session_id: sessionId, user_id: userId, file_type: 'targeted_resume', storage_path: filePath })
  await supabase.from('events').insert({ session_id: sessionId, user_id: userId, event: 'resume_targeted' })

  const bulletCount = (targetingOutput as { rewrites?: unknown[] }).rewrites?.length ?? 0

  let resume: Resume = { name: '', experience: [], education: [] }
  try {
    resume = JSON.parse(await readFile(userId, sessionId, 'resume_structured.json'))
  } catch {
    console.error('[resume-targeting] could not read resume for diff view, session:', sessionId)
  }

  return { success: true, targetingOutput, bulletCount, resume }
}
