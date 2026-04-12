import { anthropic, MODELS } from './anthropic'
import { storeMessage } from './utils/messages'
import type { IntentContext } from './types'

type ChatEmit = (event:
  | { type: 'token'; content: string }
  | { type: 'message'; role: 'assistant'; content: string }
  | { type: 'error'; code: string; message: string }
) => void

// ─── Per-context chat configuration ──────────────────────────────────────────
// Each context defines what Claude can discuss and a soft CTA instruction.
// The CTA is guidance for Claude — not a hardcoded appended bubble.

type ChatConfig = {
  scope: string
  cta: string
}

const CHAT_CONFIGS: Record<IntentContext, ChatConfig> = {
  jd_loaded: {
    scope: `The user is reviewing a short preview of a submitted job description. Answer questions about whether the capture looks complete or accurate. Redirect anything unrelated to this preview. Keep responses concise: 2–4 sentences.`,
    cta: `If asked what to do next: they can confirm the preview looks right or re-enter the JD.`,
  },

  decoded: {
    scope: `The user is exploring a decoded job description before uploading their resume. Answer questions about the role — what it's looking for, what strong candidates look like, the domain and tech, how to read specific signals or requirements. Only redirect for topics genuinely unrelated to this role (salary negotiation tactics, cover letters for other jobs). Keep responses concise: 2–4 sentences or a tight bullet list.`,
    cta: `Always end your response with a brief, natural push toward the next step: uploading or pasting their resume.`,
  },

  resume_loaded: {
    scope: `The user is reviewing an arc snapshot — a summary of how their career background reads relative to this role. Answer questions about what it means, how their background was interpreted, or what arc alignment indicates. Keep responses concise: 2–4 sentences.`,
    cta: `If asked what to do next: confirm the arc looks right or type a correction.`,
  },

  assessed_pursue_or_pass: {
    scope: `The user has just received a fit assessment. Answer questions about what the verdict means, how to interpret arc alignment and hard requirements, or why specific factors were highlighted. Be honest about uncertainty. Keep responses concise: 2–4 sentences.`,
    cta: `If asked what to do next: choose to target their resume for this role or pass on it.`,
  },

  assessed_scope: {
    scope: `The user is reviewing a proposed set of resume roles to rewrite. Answer questions about why roles were selected, what targeting scope means, or tradeoffs of broader vs. narrower scope. Keep responses concise: 2–4 sentences.`,
    cta: `If asked what to do next: confirm the scope or request changes.`,
  },

  assessed_numbers: {
    scope: `The user was asked for numbers or metrics before the rewrite begins. Answer questions about what kinds of numbers help, why quantification matters, or how to estimate when exact figures aren't known. Keep responses concise: 2–4 sentences.`,
    cta: `If asked what to do next: share whatever numbers they have — estimates are fine.`,
  },
}

// ─── System prompt ────────────────────────────────────────────────────────────

const BASE_ROLE = `You are an assistant helping someone target their resume for a specific job opening.`

function buildSystemPrompt(context: IntentContext | null, artifactContext: string): string {
  const contextSection = context
    ? `\n\n${CHAT_CONFIGS[context].scope}\n\n${CHAT_CONFIGS[context].cta}`
    : ''

  const artifactSection = artifactContext.trim()
    ? `\n\n## Session context\n${artifactContext}`
    : ''

  return `${BASE_ROLE}${contextSection}${artifactSection}`
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function handleChat(
  sessionId: string,
  userId: string,
  userMessage: string,
  context: IntentContext | null,
  artifactContext: string,
  emit: ChatEmit
): Promise<void> {
  let reply = ''

  try {
    const stream = anthropic.messages.stream({
      model: MODELS.analysis,
      max_tokens: 512,
      system: buildSystemPrompt(context, artifactContext),
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
}
