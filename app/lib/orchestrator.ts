import { getServiceClient } from './supabase'
import { readFile } from './utils/storage'
import { storeMessage, fetchMessages } from './utils/messages'
import { updateSession } from './utils/update-session'
import { loadJD } from './utils/load-jd'
import { loadResume } from './utils/load-resume'
import { exportResume } from './utils/export-resume'
import { runJDDecoder } from './skills/jd-decoder'
import { runJDMatchTurn1, runJDMatchTurn2 } from './skills/jd-match'
import { runResumeTargetingTurn1, runResumeTargetingTurn2 } from './skills/resume-targeting'
import { classifyIntent } from './intent-decoder'
import { handleChat } from './handle-chat'
import { resolveSessionContext } from './utils/session-context'
import type { CurrentStep, Resume, IntentContext, StepAction } from './types'

export type OrchestratorEvent =
  | { type: 'session_created'; session_id: string }
  | { type: 'token'; content: string }
  | { type: 'message'; role: 'assistant'; content: string; progress?: boolean }
  | { type: 'step_complete'; step: CurrentStep; data?: unknown }
  | { type: 'error'; code: string; message: string }
  | { type: 'done' }

type InboundMessage = {
  type: 'text' | 'file_upload' | 'checkpoint'
  content: string
  file_name?: string
  file_type?: string
}

export async function runOrchestrator(
  sessionId: string,
  userId: string,
  message: InboundMessage,
  session: Record<string, unknown>,
  emit: (event: OrchestratorEvent) => void
): Promise<void> {
  const currentStep = (session.current_step as CurrentStep) ?? 'created'

  await storeMessage(sessionId, 'user', message.content || message.file_name || '', currentStep)

  // ─── Intent classification gate ─────────────────────────────────────────────
  // File uploads and steps with unambiguous input skip classification.
  // For all other steps, classify before dispatching. If the user is chatting
  // or intent is unclear, respond conversationally and return without advancing.

  const SKIP_CLASSIFICATION = new Set<CurrentStep>([
    'created', 'targeted', 'exported', 'not_pursuing', 'abandoned',
  ])

  let resolvedAction: StepAction | null = null

  if (message.type === 'checkpoint') {
    // Button clicks carry their action directly — no classification needed
    resolvedAction = message.content as StepAction
  } else if (message.type !== 'file_upload' && !SKIP_CLASSIFICATION.has(currentStep)) {
    const context = await resolveIntentContext(sessionId, currentStep)
    if (context) {
      const intent = await classifyIntent(context, message.content)
      if (intent.action === 'chat' || intent.action === 'unclear') {
        const artifactContext = await resolveSessionContext(userId, sessionId)
        await handleChat(sessionId, userId, message.content, context, artifactContext, emit)
        return
      }
      resolvedAction = intent.action
    }
  }

  if (currentStep === 'created') {
    await handleCreated(sessionId, userId, message, emit)

  } else if (currentStep === 'jd_loaded') {
    if (resolvedAction === 'reject') {
      await updateSession(sessionId, userId, { current_step: 'created' })
      emit({ type: 'message', role: 'assistant', content: 'OK — paste or upload the job description again.' })
    } else {
      emit({ type: 'step_complete', step: 'jd_confirmed' })
      await handleDecodeJD(sessionId, userId, emit)
    }

  } else if (currentStep === 'decoded') {
    await handleResumeUpload(sessionId, userId, message, emit)

  } else if (currentStep === 'resume_loaded') {
    await handleArcCheckpoint(sessionId, userId, message, emit)

  } else if (currentStep === 'assessed') {
    await handleAssessed(sessionId, userId, message, session, resolvedAction, emit)

  } else if (currentStep === 'targeted') {
    await handleExport(sessionId, userId, emit)

  } else {
    emit({ type: 'error', code: 'INVALID_STATE', message: 'This session is already complete. Start a new session to work on a different role.' })
  }
}

// ─── Step handlers ────────────────────────────────────────────────────────────

async function handleCreated(
  sessionId: string,
  userId: string,
  message: InboundMessage,
  emit: (event: OrchestratorEvent) => void
) {
  emit({ type: 'message', role: 'assistant', content: 'Fetching job description...', progress: true })

  const inputType = message.type === 'file_upload'
    ? 'pdf'
    : message.content.trim().startsWith('http') ? 'url' : 'text'

  const jdResult = await loadJD({ type: inputType, content: message.content, sessionId, userId })

  if (!jdResult.success) {
    emit({ type: 'error', code: jdResult.error, message: jdResult.message })
    return
  }

  await updateSession(sessionId, userId, { current_step: 'jd_loaded' })
  emit({ type: 'step_complete', step: 'jd_loaded' })

  const preview = jdResult.rawText.slice(0, 200).trim()
  const sparse = jdResult.sparse ? ' (Note: the text looks sparse — the decode may be limited. You can continue or re-enter.)' : ''
  const previewMsg = `Got it — here's a preview:\n\n"${preview}..."\n\nDoes this look right?${sparse}`

  await storeMessage(sessionId, 'assistant', previewMsg, 'jd_loaded')
  emit({ type: 'message', role: 'assistant', content: previewMsg })
}

async function handleDecodeJD(
  sessionId: string,
  userId: string,
  emit: (event: OrchestratorEvent) => void
) {
  emit({ type: 'message', role: 'assistant', content: 'Decoding the role...', progress: true })

  const result = await runJDDecoder(sessionId, userId, emit)

  if (!result.success) {
    emit({ type: 'error', code: result.code, message: result.message })
    return
  }

  await updateSession(sessionId, userId, {
    current_step: 'decoded',
    slug: result.slug,
    company: result.company,
    role: result.roleTitle,
  })
  emit({ type: 'step_complete', step: 'decoded' })

  const resumePrompt = 'Upload your resume or paste it here.'
  await storeMessage(sessionId, 'assistant', resumePrompt, 'decoded')
  emit({ type: 'message', role: 'assistant', content: resumePrompt })
}

async function handleResumeUpload(
  sessionId: string,
  userId: string,
  message: InboundMessage,
  emit: (event: OrchestratorEvent) => void
) {
  emit({ type: 'message', role: 'assistant', content: 'Reading your resume...', progress: true })

  const fileType = message.type === 'file_upload'
    ? (message.file_type as 'pdf' | 'docx' | 'txt' ?? 'pdf')
    : 'text'

  const resumeResult = await loadResume({ type: fileType, content: message.content, sessionId, userId })

  if (!resumeResult.success) {
    emit({ type: 'error', code: resumeResult.error, message: resumeResult.message })
    return
  }

  if (resumeResult.short) {
    const lineCount = resumeResult.rawText.split('\n').filter((l: string) => l.trim()).length
    emit({ type: 'message', role: 'assistant', content: `This looks shorter than a typical resume (${lineCount} lines). Continuing — let me know if something looks off.` })
  }

  await updateSession(sessionId, userId, { current_step: 'resume_loaded' })
  emit({ type: 'step_complete', step: 'resume_loaded' })

  emit({ type: 'message', role: 'assistant', content: 'Assessing your background...', progress: true })

  const turn1Result = await runJDMatchTurn1(sessionId, userId, emit)

  if (!turn1Result.success) {
    emit({ type: 'error', code: turn1Result.code, message: turn1Result.message })
    return
  }
}

async function handleArcCheckpoint(
  sessionId: string,
  userId: string,
  message: InboundMessage,
  emit: (event: OrchestratorEvent) => void
) {
  // Check whether Turn 1 already ran (has assistant messages for this step)
  const existing = await fetchMessages(sessionId, 'resume_loaded')
  const hasArcMessage = existing.some(m => m.role === 'assistant')

  if (!hasArcMessage) {
    // Missing history — restart Turn 1 silently
    console.error('[orchestrator] missing arc message for resume_loaded, restarting Turn 1, session:', sessionId)
    emit({ type: 'message', role: 'assistant', content: 'Assessing your background...', progress: true })
    const turn1Result = await runJDMatchTurn1(sessionId, userId, emit)
    if (!turn1Result.success) emit({ type: 'error', code: turn1Result.code, message: turn1Result.message })
    return
  }

  emit({ type: 'message', role: 'assistant', content: 'Assessing fit...', progress: true })

  const turn2Result = await runJDMatchTurn2(sessionId, userId, message.content, emit)

  if (!turn2Result.success) {
    if (turn2Result.code === 'MISSING_HISTORY') {
      // Shouldn't happen given the check above, but handle gracefully
      console.error('[orchestrator] MISSING_HISTORY in Turn 2 despite arc message check, session:', sessionId)
      emit({ type: 'error', code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' })
      return
    }
    emit({ type: 'error', code: turn2Result.code, message: turn2Result.message })
    return
  }

  await updateSession(sessionId, userId, {
    current_step: 'assessed',
    verdict: turn2Result.verdict,
    hard_req_status: turn2Result.hard_req_status,
    arc_alignment: turn2Result.arc_alignment as 'strong' | 'partial' | 'weak',
    key_factors: turn2Result.key_factors,
  })

  emit({ type: 'step_complete', step: 'assessed', data: {
    verdict: turn2Result.verdict,
    hard_req_status: turn2Result.hard_req_status,
    arc_alignment: turn2Result.arc_alignment,
    key_factors: turn2Result.key_factors,
  }})
  emit({ type: 'message', role: 'assistant', content: 'Want to target your resume for this role, or pass on this one?' })
}

async function handleAssessed(
  sessionId: string,
  userId: string,
  message: InboundMessage,
  session: Record<string, unknown>,
  resolvedAction: StepAction | null,
  emit: (event: OrchestratorEvent) => void
) {
  if (resolvedAction === 'pass') {
    await updateSession(sessionId, userId, { current_step: 'not_pursuing', status: 'not_pursuing' })
    emit({ type: 'step_complete', step: 'not_pursuing' })
    emit({ type: 'message', role: 'assistant', content: 'Got it. This session is saved to your pipeline. Start a new session to work on a different role.' })
    return
  }

  const assessedMessages = await fetchMessages(sessionId, 'assessed')
  const assistantMessages = assessedMessages.filter(m => m.role === 'assistant')

  // Sub-state 1: scope not yet proposed
  if (assistantMessages.length === 0) {
    const resume: Resume = JSON.parse(await readFile(userId, sessionId, 'resume_structured.json'))
    const roles = resume.experience ?? []
    const arcAlignment = session.arc_alignment as string
    const scopeCount = arcAlignment === 'weak' ? 1 : 2
    const proposed = roles.slice(0, scopeCount)
    const roleList = proposed.map(r => `${r.title} at ${r.company}`).join(' and ')

    const scopeMsg = `I'll rewrite ${roleList}. Want to include any other roles, or does this scope work?`
    await storeMessage(sessionId, 'assistant', scopeMsg, 'assessed')
    emit({ type: 'message', role: 'assistant', content: scopeMsg })
    return
  }

  // Sub-state 2: scope proposed, Turn 1 not yet run
  const hasTurn1 = assistantMessages.length >= 2 ||
    (assistantMessages.length === 1 && !assistantMessages[0].content.includes("I'll rewrite"))

  if (!hasTurn1) {
    // Scope just confirmed — run Turn 1
    const resume: Resume = JSON.parse(await readFile(userId, sessionId, 'resume_structured.json'))
    const roles = resume.experience ?? []
    const arcAlignment = session.arc_alignment as string

    let scopeIds: string[]
    if (resolvedAction === 'scope_confirm') {
      const scopeCount = arcAlignment === 'weak' ? 1 : 2
      scopeIds = roles.slice(0, scopeCount).map(r => r.id)
    } else {
      scopeIds = roles.slice(0, 2).map(r => r.id)
    }

    const totalBullets = roles
      .filter(r => scopeIds.includes(r.id))
      .reduce((sum, r) => sum + (r.bullets?.length ?? 0), 0)
    await updateSession(sessionId, userId, { bullets_total: totalBullets })

    emit({ type: 'message', role: 'assistant', content: 'Auditing your bullets...', progress: true })

    const turn1Result = await runResumeTargetingTurn1(sessionId, userId, scopeIds, emit)

    if (!turn1Result.success) {
      emit({ type: 'error', code: turn1Result.code, message: turn1Result.message })
      return
    }

    if (!turn1Result.needsNumbers) {
      await runTurn2(sessionId, userId, emit)
    }
    // else: wait for numbers response — stay in 'assessed'
    return
  }

  // Sub-state 3: Turn 1 ran and asked for numbers — user just responded
  const lastAssistant = assistantMessages[assistantMessages.length - 1]
  const askedForNumbers = lastAssistant.content.includes('Before I rewrite') || lastAssistant.content.includes('I need a few numbers')

  if (askedForNumbers) {
    // User's numbers response already stored by runOrchestrator top-level storeMessage
    await runTurn2(sessionId, userId, emit)
  }
}

async function runTurn2(
  sessionId: string,
  userId: string,
  emit: (event: OrchestratorEvent) => void
) {
  emit({ type: 'message', role: 'assistant', content: 'Rewriting bullets...', progress: true })

  const turn2Result = await runResumeTargetingTurn2(sessionId, userId, emit)

  if (!turn2Result.success) {
    emit({ type: 'error', code: turn2Result.code, message: turn2Result.message })
    return
  }

  await updateSession(sessionId, userId, {
    current_step: 'targeted',
    bullets_total: turn2Result.bulletCount,
  })

  emit({ type: 'step_complete', step: 'targeted', data: { targeting: turn2Result.targetingOutput, resume: turn2Result.resume } })
  emit({ type: 'message', role: 'assistant', content: 'Done. Review the changes below.' })
}

async function handleExport(
  sessionId: string,
  userId: string,
  emit: (event: OrchestratorEvent) => void
) {
  emit({ type: 'message', role: 'assistant', content: 'Generating your resume...', progress: true })

  const result = await exportResume({ sessionId, userId })

  if (!result.success) {
    emit({ type: 'error', code: result.error, message: result.message })
    return
  }

  await updateSession(sessionId, userId, {
    current_step: 'exported',
    status: 'completed',
    docx_downloaded: true,
    downloaded_at: new Date().toISOString(),
  })

  emit({ type: 'step_complete', step: 'exported' })
  emit({ type: 'message', role: 'assistant', content: `Your resume is ready. [Download](${result.downloadUrl})` })
}

// ─── Intent context resolution ────────────────────────────────────────────────
// Maps the current step to the right IntentContext for classification.
// For the assessed step, the sub-state is inferred from stored message history.

async function resolveIntentContext(sessionId: string, step: CurrentStep): Promise<IntentContext | null> {
  switch (step) {
    case 'jd_loaded':    return 'jd_loaded'
    case 'decoded':      return 'decoded'
    case 'resume_loaded': return 'resume_loaded'
    case 'assessed': {
      const messages = await fetchMessages(sessionId, 'assessed')
      const assistantMessages = messages.filter(m => m.role === 'assistant')
      if (assistantMessages.length === 0) return 'assessed_pursue_or_pass'
      const hasTurn1 = assistantMessages.length >= 2 ||
        (assistantMessages.length === 1 && !assistantMessages[0].content.includes("I'll rewrite"))
      if (!hasTurn1) return 'assessed_scope'
      const last = assistantMessages[assistantMessages.length - 1]
      const askedForNumbers = last.content.includes('Before I rewrite') ||
        last.content.includes('I need a few numbers')
      return askedForNumbers ? 'assessed_numbers' : 'assessed_pursue_or_pass'
    }
    default: return null
  }
}
