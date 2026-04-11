import { anthropic, MODELS } from './anthropic'
import { storeMessage } from './utils/messages'
import type { IntentContext } from './types'

type ChatEmit = (event:
  | { type: 'token'; content: string }
  | { type: 'message'; role: 'assistant'; content: string }
  | { type: 'error'; code: string; message: string }
) => void

// ─── Pending reminders ────────────────────────────────────────────────────────
// After responding conversationally, re-surface the pending question so the
// user knows what the app is still waiting for. Keyed by IntentContext because
// the assessed step has three distinct sub-states each with a different prompt.

const PENDING_REMINDERS: Record<IntentContext, string> = {
  jd_loaded:               'When you\'re ready — does that job description look right?',
  resume_loaded:           'When you\'re ready — does that career arc snapshot look accurate?',
  assessed_pursue_or_pass: 'Whenever you\'d like to continue — do you want to target your resume for this role, or pass on it?',
  assessed_scope:          'Whenever you\'re ready — does that targeting scope work, or would you like to adjust it?',
  assessed_numbers:        'Whenever you\'re ready — any numbers or metrics you can share for those bullets would help.',
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an assistant helping someone target their resume for a specific job opening.

Answer questions about the resume targeting process — things like what arc alignment means, why you're asking for certain information, what a verdict label indicates, or how the targeting works. You can also briefly acknowledge how the user is feeling about a role or their candidacy.

Stay within this scope. If the user asks about something outside resume targeting — cover letters, salary negotiation, interview prep, career advice in general, unrelated topics — acknowledge the question briefly and redirect:
"That's outside what I help with here. I'm focused on targeting your resume for this role. Let me know when you're ready to continue."

Keep responses brief: 1–3 sentences. Do not ask follow-up questions.`

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function handleChat(
  sessionId: string,
  userId: string,
  userMessage: string,
  context: IntentContext | null,
  emit: ChatEmit
): Promise<void> {
  let reply = ''

  try {
    const stream = anthropic.messages.stream({
      model: MODELS.analysis,
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        emit({ type: 'token', content: chunk.delta.text })
        reply += chunk.delta.text
      }
    }
  } catch {
    emit({ type: 'error', code: 'CHAT_ERROR', message: 'Something went wrong. Please try again.' })
    return
  }

  if (reply) {
    await storeMessage(sessionId, 'assistant', reply, 'chat')
  }

  // Re-surface the pending question so the user knows what the app is waiting for
  if (context) {
    const reminder = PENDING_REMINDERS[context]
    emit({ type: 'message', role: 'assistant', content: reminder })
  }
}
