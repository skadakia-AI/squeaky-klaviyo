import { anthropic, MODELS } from './anthropic'
import type { IntentContext, StepAction, StepIntent } from './types'

// ─── Context configuration ────────────────────────────────────────────────────
// Each context defines: the pending question the user was asked, the valid
// actions they can express, and plain-English descriptions for the classifier.

type ContextConfig = {
  pendingPrompt: string
  validActions: StepAction[]
  actionDescriptions: Partial<Record<StepAction, string>>
}

const CONTEXT_CONFIGS: Record<IntentContext, ContextConfig> = {
  jd_loaded: {
    pendingPrompt: '"Does this look right?" (reviewing a job description preview)',
    validActions: ['confirm', 'reject', 'chat', 'unclear'],
    actionDescriptions: {
      confirm: 'user agrees the job description looks correct and wants to proceed',
      reject:  'user says it is wrong or wants to re-enter the job description',
      chat:    'user is asking a question or making a conversational comment',
      unclear: 'cannot determine intent from the message',
    },
  },

  resume_loaded: {
    pendingPrompt: '"Does this career arc snapshot look accurate?" (reviewing a summary of their background)',
    validActions: ['confirm', 'chat', 'unclear'],
    actionDescriptions: {
      confirm: 'user confirms the arc snapshot is accurate, possibly with corrections or additions',
      chat:    'user is asking a question or making a conversational comment',
      unclear: 'cannot determine intent from the message',
    },
  },

  assessed_pursue_or_pass: {
    pendingPrompt: '"Want to target your resume for this role, or pass on this one?"',
    validActions: ['confirm', 'pass', 'chat', 'unclear'],
    actionDescriptions: {
      confirm: 'user wants to proceed with targeting their resume for this role',
      pass:    'user does not want to pursue this role',
      chat:    'user is asking a question or making a conversational comment',
      unclear: 'cannot determine intent from the message',
    },
  },

  assessed_scope: {
    pendingPrompt: '"Does this targeting scope work, or do you want to include other roles?"',
    validActions: ['scope_confirm', 'scope_add', 'chat', 'unclear'],
    actionDescriptions: {
      scope_confirm: 'user agrees with the proposed set of roles to rewrite',
      scope_add:     'user wants to add or change which roles are included in the rewrite',
      chat:          'user is asking a question or making a conversational comment',
      unclear:       'cannot determine intent from the message',
    },
  },

  assessed_numbers: {
    pendingPrompt: '"Can you provide some numbers or metrics for your bullet points?"',
    validActions: ['numbers_response', 'chat', 'unclear'],
    actionDescriptions: {
      numbers_response: 'user is providing numbers, metrics, or any response to the quantification request — including saying they do not have exact numbers',
      chat:             'user is asking a question or making a conversational comment',
      unclear:          'cannot determine intent from the message',
    },
  },
}

// ─── Classifier ───────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an intent classifier for a job application assistant app. \
Given a workflow context and a user message, classify the user's intent into exactly one \
of the allowed actions for that context.

Respond with JSON only — no explanation, no markdown:
{"action": "<action>", "confidence": "high" | "low"}

Use "low" confidence when the message is genuinely ambiguous. \
Default to "high" when the intent is reasonably clear.`

export async function classifyIntent(
  context: IntentContext,
  userMessage: string
): Promise<StepIntent> {
  const config = CONTEXT_CONFIGS[context]

  const actionList = config.validActions
    .map(a => `- "${a}": ${config.actionDescriptions[a]}`)
    .join('\n')

  const userPrompt =
    `Workflow context: the user was asked ${config.pendingPrompt}\n` +
    `Allowed actions:\n${actionList}\n\n` +
    `User message: "${userMessage}"`

  try {
    const response = await anthropic.messages.create({
      model: MODELS.parsing,
      max_tokens: 80,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

    let parsed: { action?: string; confidence?: string }
    try {
      parsed = JSON.parse(text)
    } catch {
      return { action: 'unclear', confidence: 'low' }
    }

    const action = parsed.action
    const confidence: 'high' | 'low' = parsed.confidence === 'low' ? 'low' : 'high'

    if (!action || !config.validActions.includes(action as StepAction)) {
      return { action: 'unclear', confidence: 'low' }
    }

    return { action: action as StepAction, confidence }

  } catch {
    // API failure — never block the user, fall back to chat so the
    // conversation handler can respond and re-ask the pending question
    return { action: 'chat', confidence: 'low' }
  }
}
