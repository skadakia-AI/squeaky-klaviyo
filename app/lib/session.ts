'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type {
  ClientState,
  ChatMessage,
  CurrentStep,
  OutboundMessage,
  SSEEvent,
  StoredMessage,
  TargetingOutput,
  FitAssessmentData,
  Resume,
} from './types'
import { fetchSessionById, fetchTargetingData, postReviews } from './api'
import { openStream } from './sse'

// Parses the machine-readable verdict block out of raw LLM output text.
// Used for live streaming (render card as tokens arrive) and session recovery
// (toMsg promotes stored assistant messages that contain a verdict block).
// Returns null if the content doesn't look like a fit assessment.
export function parseVerdictFromText(
  content: string
): Pick<FitAssessmentData, 'verdict' | 'arc_alignment' | 'key_factors' | 'hard_req_status'> | null {
  if (!content.includes('verdict:')) return null
  const get = (field: string) =>
    content.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? ''
  const verdict = get('verdict')
  const validVerdicts: FitAssessmentData['verdict'][] = ['no-brainer', 'stretch but doable', 'not a fit']
  if (!validVerdicts.includes(verdict as FitAssessmentData['verdict'])) return null
  return {
    verdict: verdict as FitAssessmentData['verdict'],
    arc_alignment: get('arc_alignment') as FitAssessmentData['arc_alignment'],
    key_factors: get('key_factors'),
    hard_req_status: get('hard_req_status'),
  }
}

const initialState: ClientState = {
  sessionId: null,
  currentStep: null,
  isStreaming: false,
  messages: [],
  checkpoint: null,
  showDiffView: false,
  targetingData: null,
  resumeData: null,
  bulletReviews: {},
  bulletEdits: {},
  unreviewedCount: 0,
  excludedOutOfScopeRoles: [],
  quantificationQuestions: null,
  error: null,
}

export function applyDone(state: ClientState): ClientState {
  let checkpoint = state.checkpoint

  if (!state.error) {
    if (state.currentStep === 'resume_loaded') {
      checkpoint = 'arc_confirmation'
    } else if (state.currentStep === 'assessed') {
      // Scope was just proposed — last assistant text message is the scope proposal.
      // Distinct from Turn 1 (which runs bullet audit, not a scope question).
      const lastAssistant = [...state.messages]
        .reverse()
        .find(m => m.role === 'assistant' && m.type === 'text')
      if (lastAssistant?.content.includes("I'll rewrite")) {
        checkpoint = 'scope_selection'
      }
    }
  }

  return { ...state, isStreaming: false, checkpoint }
}

export function applyStepComplete(state: ClientState, step: CurrentStep, data?: unknown): ClientState {
  switch (step) {
    case 'jd_loaded':
      return { ...state, currentStep: step }

    case 'decoded': {
      // Promote the last streamed assistant message to a jd_decode_card
      const messages = [...state.messages]
      const lastIdx = [...messages].reverse().findIndex(m => m.role === 'assistant' && m.type === 'text')
      if (lastIdx >= 0) {
        const idx = messages.length - 1 - lastIdx
        messages[idx] = { ...messages[idx], type: 'jd_decode_card' }
      }
      return { ...state, currentStep: step, checkpoint: null, messages }
    }

    case 'resume_loaded':
      return { ...state, currentStep: step }

    case 'assessed': {
      const d = data as { verdict: string; hard_req_status: string; arc_alignment: string; key_factors: string } | undefined
      // Promote the last streamed assistant message to a fit_assessment_card
      const messages = [...state.messages]
      const lastIdx = [...messages].reverse().findIndex(m => m.role === 'assistant' && m.type === 'text')
      if (lastIdx >= 0 && d) {
        const idx = messages.length - 1 - lastIdx
        messages[idx] = {
          ...messages[idx],
          type: 'fit_assessment_card',
          data: {
            verdict: d.verdict as FitAssessmentData['verdict'],
            hard_req_status: d.hard_req_status,
            arc_alignment: d.arc_alignment as FitAssessmentData['arc_alignment'],
            key_factors: d.key_factors,
            full_text: messages[idx].content,
          } satisfies FitAssessmentData,
        }
      }
      return { ...state, currentStep: step, checkpoint: 'pursue_or_pass', messages }
    }

    case 'not_pursuing':
      return { ...state, currentStep: step, checkpoint: null }

    case 'targeted': {
      const d = data as { targeting: TargetingOutput; resume: Resume } | undefined
      return {
        ...state,
        currentStep: step,
        showDiffView: true,
        checkpoint: null,
        targetingData: d?.targeting ?? null,
        resumeData: d?.resume ?? null,
        unreviewedCount: (d?.targeting?.rewrites?.length ?? 0) + (d?.targeting?.flagged_for_removal?.length ?? 0),
      }
    }

    case 'exported':
      return { ...state, currentStep: step, showDiffView: false }

    default:
      return { ...state, currentStep: step }
  }
}

function toMsg(m: StoredMessage): ChatMessage {
  if (m.role === 'assistant') {
    const parsed = parseVerdictFromText(m.content)
    if (parsed) {
      return {
        id: crypto.randomUUID(),
        role: m.role,
        content: m.content,
        type: 'fit_assessment_card',
        data: { ...parsed, full_text: m.content } satisfies FitAssessmentData,
        timestamp: new Date(m.created_at).getTime(),
      }
    }
  }
  return {
    id: crypto.randomUUID(),
    role: m.role,
    content: m.content,
    type: 'text',
    timestamp: new Date(m.created_at).getTime(),
  }
}

export function useSession(initialSessionId: string | null = null) {
  const [state, setState] = useState<ClientState>(initialState)
  const router = useRouter()

  const stateRef = useRef(state)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    stateRef.current = state
  })

  // If a session ID was provided in the URL, hydrate directly from DB.
  // If null (lazy mode), wait for the user's first message to create one.
  useEffect(() => {
    if (!initialSessionId) return

    fetchSessionById(initialSessionId).then(async result => {
      if (!result) {
        router.replace('/')
        return
      }

      const { session, messages } = result
      const mappedMessages = messages.map(toMsg)
      const step = session.current_step

      // Derive checkpoint from step + message history (mirrors applyDone logic)
      let checkpoint: ClientState['checkpoint'] = null
      if (step === 'resume_loaded') {
        const lastMsg = mappedMessages[mappedMessages.length - 1]
        if (lastMsg?.role === 'assistant') checkpoint = 'arc_confirmation'
      } else if (step === 'assessed') {
        const lastMsg = mappedMessages[mappedMessages.length - 1]
        if (lastMsg?.type === 'fit_assessment_card') {
          checkpoint = 'pursue_or_pass'
        } else {
          const lastAssistant = [...mappedMessages].reverse().find(m => m.role === 'assistant' && m.type === 'text')
          if (lastAssistant?.content.includes("I'll rewrite")) checkpoint = 'scope_selection'
        }
      }

      // For targeted sessions, fetch targeting JSON from storage to restore diff view
      let showDiffView = false
      let targetingData: ClientState['targetingData'] = null
      let resumeData: ClientState['resumeData'] = null
      let unreviewedCount = 0
      if (step === 'targeted') {
        showDiffView = true
        const td = await fetchTargetingData(initialSessionId)
        if (td) {
          targetingData = td.targeting
          resumeData = td.resume
          unreviewedCount = (td.targeting?.rewrites?.length ?? 0) + (td.targeting?.flagged_for_removal?.length ?? 0)
        }
      }

      setState(prev => ({
        ...prev,
        sessionId: session.id,
        currentStep: step,
        messages: mappedMessages,
        checkpoint,
        showDiffView,
        targetingData,
        resumeData,
        unreviewedCount,
        bulletReviews: session.bullet_reviews ?? {},
        bulletEdits: session.bullet_edits ?? {},
        excludedOutOfScopeRoles: session.excluded_out_of_scope_roles ?? [],
      }))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSessionId])

  // ─── SSE event handler ──────────────────────────────────────────────────────

  const handleEvent = useCallback((event: SSEEvent) => {
    switch (event.type) {
      case 'session_created':
        setState(prev => ({ ...prev, sessionId: event.session_id }))
        // In lazy mode (/session/new), update the URL without triggering React re-navigation.
        // router.replace() causes the hydration effect to re-run mid-stream, wiping state.
        if (!initialSessionId) {
          window.history.replaceState(null, '', `/session/${event.session_id}`)
        }
        break

      case 'token':
        setState(prev => {
          const messages = [...prev.messages]
          const last = messages[messages.length - 1]
          if (last?.role === 'assistant' && last.type === 'text') {
            messages[messages.length - 1] = { ...last, content: last.content + event.content }
          } else {
            messages.push({
              id: crypto.randomUUID(),
              role: 'assistant',
              content: event.content,
              type: 'text',
              timestamp: Date.now(),
            })
          }
          return { ...prev, messages }
        })
        break

      case 'message':
        setState(prev => ({
          ...prev,
          messages: [...prev.messages, {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content: event.content,
            type: (event.progress ? 'progress' : 'text') as ChatMessage['type'],
            timestamp: Date.now(),
          }],
        }))
        break

      case 'step_complete':
        if (event.step === 'exported') {
          const url = (event.data as { downloadUrl?: string })?.downloadUrl
          if (url) window.open(url, '_blank')
        }
        setState(prev => applyStepComplete(prev, event.step, event.data))
        break

      case 'quantification_needed':
        setState(prev => ({ ...prev, quantificationQuestions: event.questions }))
        break

      case 'error':
        setState(prev => {
          const messages = [...prev.messages]
          if (prev.isStreaming) {
            while (messages.length > 0) {
              const last = messages[messages.length - 1]
              if (last.role === 'assistant' && (last.type === 'progress' || last.type === 'text')) {
                messages.pop()
              } else {
                break
              }
            }
          }
          messages.push({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: event.message,
            type: 'error',
            timestamp: Date.now(),
          })
          return { ...prev, messages, quantificationQuestions: null, error: { code: event.code, message: event.message }, isStreaming: false }
        })
        break

      case 'done':
        setState(prev => applyDone(prev))
        break
    }
  }, [initialSessionId])

  // ─── Actions ────────────────────────────────────────────────────────────────

  const sendMessage = useCallback((message: OutboundMessage) => {
    if (stateRef.current.isStreaming) return

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message.type === 'file_upload'
        ? (message.file_name ?? 'Uploaded file')
        : (message.display ?? message.content),
      type: message.type === 'file_upload' ? 'file_upload' : 'text',
      timestamp: Date.now(),
    }

    setState(prev => ({ ...prev, isStreaming: true, error: null, checkpoint: null, quantificationQuestions: null, messages: message.silent ? prev.messages : [...prev.messages, userMsg] }))

    cleanupRef.current?.()
    cleanupRef.current = openStream(message, stateRef.current.sessionId, handleEvent)
  }, [handleEvent])

  const acceptBullet = useCallback((bulletId: string) => {
    setState(prev => {
      const wasUnreviewed = prev.bulletReviews[bulletId] === undefined
      return {
        ...prev,
        bulletReviews: { ...prev.bulletReviews, [bulletId]: true },
        unreviewedCount: wasUnreviewed ? Math.max(0, prev.unreviewedCount - 1) : prev.unreviewedCount,
      }
    })
  }, [])

  const rejectBullet = useCallback((bulletId: string) => {
    setState(prev => {
      const wasUnreviewed = prev.bulletReviews[bulletId] === undefined
      return {
        ...prev,
        bulletReviews: { ...prev.bulletReviews, [bulletId]: false },
        unreviewedCount: wasUnreviewed ? Math.max(0, prev.unreviewedCount - 1) : prev.unreviewedCount,
      }
    })
  }, [])

  const editBullet = useCallback((bulletId: string, text: string) => {
    setState(prev => {
      const wasUnreviewed = prev.bulletReviews[bulletId] === undefined && !prev.bulletEdits[bulletId]
      return {
        ...prev,
        bulletEdits: { ...prev.bulletEdits, [bulletId]: text },
        bulletReviews: { ...prev.bulletReviews, [bulletId]: true },
        unreviewedCount: wasUnreviewed ? Math.max(0, prev.unreviewedCount - 1) : prev.unreviewedCount,
      }
    })
  }, [])

  const submitQuantifications = useCallback((answers: string[]) => {
    const questions = stateRef.current.quantificationQuestions
    if (!questions) return
    const lines = questions.map((q, i) => {
      const answer = answers[i]?.trim()
      return `- "${q.bullet}": ${answer || '(skipped)'}`
    })
    const text = `Here are the numbers:\n${lines.join('\n')}`
    sendMessage({ type: 'text', content: text })
  }, [sendMessage])

  const toggleOutOfScopeRole = useCallback((roleId: string) => {
    setState(prev => {
      const excluded = prev.excludedOutOfScopeRoles
      const isExcluded = excluded.includes(roleId)
      return {
        ...prev,
        excludedOutOfScopeRoles: isExcluded
          ? excluded.filter(id => id !== roleId)
          : [...excluded, roleId],
      }
    })
  }, [])

  const downloadResume = useCallback(async () => {
    const { sessionId, bulletReviews, bulletEdits, excludedOutOfScopeRoles } = stateRef.current
    if (!sessionId) return

    const result = await postReviews(sessionId, bulletReviews, bulletEdits, excludedOutOfScopeRoles)
    if (!result.success) {
      setState(prev => ({ ...prev, error: { code: 'REVIEWS_FAILED', message: 'Failed to save your selections. Please try again.' } }))
      return
    }

    sendMessage({ type: 'text', content: 'export', silent: true })
  }, [sendMessage])

  const clearCheckpoint = useCallback(() => {
    setState(prev => ({ ...prev, checkpoint: null }))
  }, [])

  const startNewSession = useCallback(() => {
    cleanupRef.current?.()
    cleanupRef.current = null
    setState(initialState)
    router.push('/session/new')
  }, [router])

  return {
    sessionId: state.sessionId,
    currentStep: state.currentStep,
    isStreaming: state.isStreaming,
    messages: state.messages,
    checkpoint: state.checkpoint,
    showDiffView: state.showDiffView,
    targetingData: state.targetingData,
    resumeData: state.resumeData,
    bulletReviews: state.bulletReviews,
    bulletEdits: state.bulletEdits,
    unreviewedCount: state.unreviewedCount,
    excludedOutOfScopeRoles: state.excludedOutOfScopeRoles,
    quantificationQuestions: state.quantificationQuestions,
    error: state.error,
    sendMessage,
    acceptBullet,
    rejectBullet,
    editBullet,
    toggleOutOfScopeRole,
    submitQuantifications,
    downloadResume,
    clearCheckpoint,
    startNewSession,
  }
}
