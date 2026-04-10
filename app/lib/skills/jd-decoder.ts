import fs from 'fs'
import path from 'path'
import { anthropic, MODELS } from '../anthropic'
import { readFile, writeFile, storagePath } from '../utils/storage'
import { storeMessage } from '../utils/messages'
import { getServiceClient } from '../supabase'

type SkillEmit = (event:
  | { type: 'token'; content: string }
  | { type: 'error'; code: string; message: string }
) => void

export type JDDecoderResult =
  | { success: true; decodedText: string; roleTitle: string; company: string; slug: string }
  | { success: false; code: string; message: string }

export async function runJDDecoder(
  sessionId: string,
  userId: string,
  emit: SkillEmit
): Promise<JDDecoderResult> {
  let rawText: string
  try {
    rawText = await readFile(userId, sessionId, 'raw_jd.md')
  } catch {
    return { success: false, code: 'STORAGE_ERROR', message: 'Couldn\'t load the job description. Please start a new session.' }
  }

  const system = fs.readFileSync(path.join(process.cwd(), 'skills', 'jd-decoder.md'), 'utf-8')
  const userMsg = `jd_text: ${rawText}\nsession_id: ${sessionId}\nuser_id: ${userId}`

  let decodedText = ''
  try {
    const stream = anthropic.messages.stream({
      model: MODELS.analysis,
      max_tokens: 8096,
      system,
      messages: [{ role: 'user', content: userMsg }],
    })
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        emit({ type: 'token', content: chunk.delta.text })
        decodedText += chunk.delta.text
      }
    }
  } catch (err: unknown) {
    const status = (err as { status?: number }).status
    if (status === 429) return { success: false, code: 'RATE_LIMITED', message: 'The AI service is busy — wait a moment and try again.' }
    return { success: false, code: 'API_ERROR', message: 'The analysis failed. Please try again.' }
  }

  const headerMatch = decodedText.match(/^# JD Decoded: (.+?) @ (.+)$/m)
  const roleTitle = headerMatch?.[1]?.trim() ?? ''
  const company = headerMatch?.[2]?.trim() ?? ''
  const slug = `${company}-${roleTitle}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  try {
    await writeFile(userId, sessionId, 'decoded_jd.md', decodedText, 'text/markdown')
  } catch {
    return { success: false, code: 'UPLOAD_FAILED', message: 'Failed to save the decoded job description. Please try again.' }
  }

  const supabase = getServiceClient()
  const filePath = storagePath(userId, sessionId, 'decoded_jd.md')
  await supabase.from('files').insert({ session_id: sessionId, user_id: userId, file_type: 'decoded_jd', storage_path: filePath })
  await supabase.from('events').insert({ session_id: sessionId, user_id: userId, event: 'decode_completed' })
  await storeMessage(sessionId, 'assistant', decodedText, 'decoded')

  return { success: true, decodedText, roleTitle, company, slug }
}
