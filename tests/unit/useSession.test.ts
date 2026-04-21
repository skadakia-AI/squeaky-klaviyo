// @vitest-environment happy-dom
import { renderHook, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useSession } from '../../app/lib/session'
import type { StoredMessage } from '../../app/lib/types'

// ─── Mocks ────────────────────────────────────────────────────────────────────

// vi.mock factories are hoisted above variable declarations, so mock fns must
// be created with vi.hoisted() to be accessible inside the factory closures.
const { mockReplace, mockPush, mockFetchSessionById, mockFetchTargetingData, mockOpenStream } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockPush: vi.fn(),
  mockFetchSessionById: vi.fn(),
  mockFetchTargetingData: vi.fn(),
  mockOpenStream: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}))

vi.mock('../../app/lib/api', () => ({
  fetchSessionById: mockFetchSessionById,
  fetchTargetingData: mockFetchTargetingData,
  getActiveSession: vi.fn().mockResolvedValue({ session: null, messages: [] }),
  fetchSessions: vi.fn().mockResolvedValue([]),
  fetchArtifact: vi.fn().mockResolvedValue(null),
  triggerExport: vi.fn().mockResolvedValue(null),
  postReviews: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('../../app/lib/sse', () => ({
  openStream: mockOpenStream,
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSession(overrides = {}) {
  return {
    id: 'sess-1',
    current_step: 'assessed' as const,
    status: 'in_progress',
    bullet_reviews: {},
    bullet_edits: {},
    excluded_out_of_scope_roles: [],
    ...overrides,
  }
}

function makeMessage(overrides: Partial<StoredMessage> = {}): StoredMessage {
  return {
    id: 'msg-1',
    role: 'assistant',
    content: 'Here is your fit assessment.',
    step: 'assessed',
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useSession — direct hydration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOpenStream.mockReturnValue(() => {})
  })

  it('populates state from DB when initialSessionId is provided', async () => {
    mockFetchSessionById.mockResolvedValue({
      session: makeSession({ id: 'sess-1', current_step: 'assessed' }),
      messages: [makeMessage(), makeMessage({ id: 'msg-2', role: 'user', content: 'Yes, tailor it.' })],
    })

    const { result } = renderHook(() => useSession('sess-1'))

    await waitFor(() => expect(result.current.sessionId).toBe('sess-1'))
    expect(result.current.currentStep).toBe('assessed')
    expect(result.current.messages).toHaveLength(2)
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('restores bullet reviews and edits from session data', async () => {
    mockFetchSessionById.mockResolvedValue({
      session: makeSession({
        bullet_reviews: { 'r0-b0': true, 'r0-b1': false },
        bullet_edits: { 'r1-b0': 'Edited bullet text.' },
      }),
      messages: [],
    })

    const { result } = renderHook(() => useSession('sess-1'))

    await waitFor(() => expect(result.current.sessionId).toBe('sess-1'))
    expect(result.current.bulletReviews).toEqual({ 'r0-b0': true, 'r0-b1': false })
    expect(result.current.bulletEdits).toEqual({ 'r1-b0': 'Edited bullet text.' })
  })

  it('redirects to / when the session ID is not found', async () => {
    mockFetchSessionById.mockResolvedValue(null)

    renderHook(() => useSession('bad-id'))

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'))
  })
})

describe('useSession — checkpoint restoration on hydration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOpenStream.mockReturnValue(() => {})
    mockFetchTargetingData.mockResolvedValue(null)
  })

  it('restores arc_confirmation checkpoint when resume_loaded session ends with assistant message', async () => {
    mockFetchSessionById.mockResolvedValue({
      session: makeSession({ current_step: 'resume_loaded' }),
      messages: [
        makeMessage({ role: 'assistant', content: 'Here is your career arc snapshot.', step: 'resume_loaded' }),
      ],
    })

    const { result } = renderHook(() => useSession('sess-1'))
    await waitFor(() => expect(result.current.sessionId).toBe('sess-1'))

    expect(result.current.checkpoint).toBe('arc_confirmation')
  })

  it('does not set arc_confirmation when resume_loaded session has user message after arc snapshot', async () => {
    mockFetchSessionById.mockResolvedValue({
      session: makeSession({ current_step: 'resume_loaded' }),
      messages: [
        makeMessage({ id: 'msg-1', role: 'assistant', content: 'Here is your career arc snapshot.', step: 'resume_loaded' }),
        makeMessage({ id: 'msg-2', role: 'user', content: 'Looks right — assess fit', step: 'resume_loaded' }),
      ],
    })

    const { result } = renderHook(() => useSession('sess-1'))
    await waitFor(() => expect(result.current.sessionId).toBe('sess-1'))

    expect(result.current.checkpoint).toBeNull()
  })

  it('restores pursue_or_pass checkpoint when assessed session ends with a fit_assessment_card', async () => {
    // A message containing a verdict block is promoted to fit_assessment_card by toMsg
    const fitAssessmentContent = [
      'Full assessment text here.',
      'verdict: no-brainer',
      'arc_alignment: strong',
      'key_factors: 5+ years experience',
      'hard_req_status: all met',
    ].join('\n')

    mockFetchSessionById.mockResolvedValue({
      session: makeSession({ current_step: 'assessed' }),
      messages: [makeMessage({ role: 'assistant', content: fitAssessmentContent, step: 'resume_loaded' })],
    })

    const { result } = renderHook(() => useSession('sess-1'))
    await waitFor(() => expect(result.current.sessionId).toBe('sess-1'))

    expect(result.current.checkpoint).toBe('pursue_or_pass')
  })

  it('restores scope_selection checkpoint when assessed session ends with scope proposal', async () => {
    mockFetchSessionById.mockResolvedValue({
      session: makeSession({ current_step: 'assessed' }),
      messages: [
        makeMessage({ id: 'msg-1', role: 'assistant', content: 'Here is your fit.', step: 'resume_loaded' }),
        makeMessage({ id: 'msg-2', role: 'user', content: 'Pursue it.', step: 'assessed' }),
        makeMessage({ id: 'msg-3', role: 'assistant', content: "I'll rewrite bullets for your last two roles.", step: 'assessed' }),
      ],
    })

    const { result } = renderHook(() => useSession('sess-1'))
    await waitFor(() => expect(result.current.sessionId).toBe('sess-1'))

    expect(result.current.checkpoint).toBe('scope_selection')
  })
})

describe('useSession — quantification panel restoration on hydration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOpenStream.mockReturnValue(() => {})
    mockFetchTargetingData.mockResolvedValue(null)
  })

  it('restores quantificationQuestions when Turn 1 asked for numbers and user left before submitting', async () => {
    const turn1Text = [
      'Before I rewrite, I need a few numbers:',
      '',
      '- Built a data pipeline for daily ETL — what was the data volume processed per day?',
      '- Led migration to Kubernetes — how many services were migrated?',
      '',
      'Rough estimates are fine.',
    ].join('\n')

    mockFetchSessionById.mockResolvedValue({
      session: makeSession({ current_step: 'assessed' }),
      messages: [
        makeMessage({ id: 'msg-1', role: 'assistant', content: 'verdict: no-brainer\narc_alignment: strong\nkey_factors: x\nhard_req_status: all met', step: 'resume_loaded' }),
        makeMessage({ id: 'msg-2', role: 'user', content: 'pursue', step: 'assessed' }),
        makeMessage({ id: 'msg-3', role: 'assistant', content: "I'll rewrite your last two roles.", step: 'assessed' }),
        makeMessage({ id: 'msg-4', role: 'user', content: 'scope confirmed', step: 'assessed' }),
        makeMessage({ id: 'msg-5', role: 'assistant', content: turn1Text, step: 'assessed' }),
      ],
    })

    const { result } = renderHook(() => useSession('sess-1'))
    await waitFor(() => expect(result.current.sessionId).toBe('sess-1'))

    expect(result.current.quantificationQuestions).toHaveLength(2)
    expect(result.current.quantificationQuestions![0]).toEqual({
      bullet: 'Built a data pipeline for daily ETL',
      question: 'what was the data volume processed per day?',
    })
    expect(result.current.checkpoint).toBeNull()
  })

  it('does not restore quantificationQuestions when Turn 1 said no numbers needed', async () => {
    const turn1Text = 'No numbers needed — your bullets already have strong metrics. Moving on to rewrites.'

    mockFetchSessionById.mockResolvedValue({
      session: makeSession({ current_step: 'assessed' }),
      messages: [
        makeMessage({ id: 'msg-1', role: 'assistant', content: 'verdict: no-brainer\narc_alignment: strong\nkey_factors: x\nhard_req_status: all met', step: 'resume_loaded' }),
        makeMessage({ id: 'msg-2', role: 'user', content: 'pursue', step: 'assessed' }),
        makeMessage({ id: 'msg-3', role: 'assistant', content: "I'll rewrite your last two roles.", step: 'assessed' }),
        makeMessage({ id: 'msg-4', role: 'user', content: 'scope confirmed', step: 'assessed' }),
        makeMessage({ id: 'msg-5', role: 'assistant', content: turn1Text, step: 'assessed' }),
      ],
    })

    const { result } = renderHook(() => useSession('sess-1'))
    await waitFor(() => expect(result.current.sessionId).toBe('sess-1'))

    expect(result.current.quantificationQuestions).toBeNull()
  })
})

describe('useSession — targeted session hydration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOpenStream.mockReturnValue(() => {})
  })

  it('sets showDiffView and loads targeting data for targeted sessions', async () => {
    const mockTargeting = {
      scope: ['r0'],
      rewrites: [{ bullet_id: 'r0-b0', original: 'Built things', rewritten: 'Built scalable things' }],
      flagged_for_removal: [],
      out_of_scope_roles: [],
    }
    const mockResume = {
      name: 'Test User',
      experience: [{
        id: 'r0', company: 'Acme', title: 'SWE',
        bullets: [{ id: 'r0-b0', text: 'Built things' }],
      }],
      education: [],
    }

    mockFetchSessionById.mockResolvedValue({
      session: makeSession({ current_step: 'targeted' }),
      messages: [],
    })
    mockFetchTargetingData.mockResolvedValue({ targeting: mockTargeting, resume: mockResume })

    const { result } = renderHook(() => useSession('sess-1'))
    await waitFor(() => expect(result.current.showDiffView).toBe(true))

    expect(result.current.targetingData).toEqual(mockTargeting)
    expect(result.current.resumeData).toEqual(mockResume)
    expect(result.current.unreviewedCount).toBe(1)
    expect(mockFetchTargetingData).toHaveBeenCalledWith('sess-1')
  })

  it('sets showDiffView but leaves targetingData null when targeting fetch fails', async () => {
    mockFetchSessionById.mockResolvedValue({
      session: makeSession({ current_step: 'targeted' }),
      messages: [],
    })
    mockFetchTargetingData.mockResolvedValue(null)

    const { result } = renderHook(() => useSession('sess-1'))
    await waitFor(() => expect(result.current.sessionId).toBe('sess-1'))

    expect(result.current.showDiffView).toBe(true)
    expect(result.current.targetingData).toBeNull()
  })
})

describe('useSession — lazy creation URL replacement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates URL via history.replaceState (not router.replace) after session_created in lazy mode', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState')

    mockOpenStream.mockImplementation(
      (_msg: unknown, _sessionId: unknown, onEvent: (e: unknown) => void) => {
        setTimeout(() => {
          onEvent({ type: 'session_created', session_id: 'new-sess-abc' })
          onEvent({ type: 'done' })
        }, 0)
        return () => {}
      }
    )

    const { result } = renderHook(() => useSession(null))

    act(() => {
      result.current.sendMessage({ type: 'text', content: 'here is a job description' })
    })

    await waitFor(() => expect(replaceState).toHaveBeenCalledWith(null, '', '/session/new-sess-abc'))
    expect(result.current.sessionId).toBe('new-sess-abc')
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('does not replace URL after session_created when session was loaded by ID', async () => {
    mockFetchSessionById.mockResolvedValue({
      session: makeSession({ id: 'existing-sess' }),
      messages: [],
    })

    mockOpenStream.mockImplementation(
      (_msg: unknown, _sessionId: unknown, onEvent: (e: unknown) => void) => {
        setTimeout(() => {
          // This fires on a re-send within an existing session — should not trigger router.replace
          onEvent({ type: 'session_created', session_id: 'existing-sess' })
          onEvent({ type: 'done' })
        }, 0)
        return () => {}
      }
    )

    const { result } = renderHook(() => useSession('existing-sess'))
    await waitFor(() => expect(result.current.sessionId).toBe('existing-sess'))

    act(() => {
      result.current.sendMessage({ type: 'text', content: 'add resume' })
    })

    await waitFor(() => expect(mockOpenStream).toHaveBeenCalled())
    expect(mockReplace).not.toHaveBeenCalled()
  })
})

// ─── Review actions ────────────────────────────────────────────────────────────
//
// These tests cover the unreviewedCount guard: reviewing an item decrements the
// count exactly once, regardless of how many times or in which direction the
// review changes after that.

const mockTargeting = {
  role: 'Software Engineer',
  scope: ['r0'],
  rewrites: [
    { bullet_id: 'r0-b0', original: 'Did stuff', rewritten: 'Shipped stuff', objective: 'Impact', structure: 'CAR', unquantified: false },
    { bullet_id: 'r0-b1', original: 'Made things', rewritten: 'Built things', objective: 'Scale', structure: 'CAR', unquantified: false },
  ],
  flagged_for_removal: [
    { bullet_id: 'r0-b2', original: 'Old stuff', reason: 'Not relevant' },
  ],
  credibility_check: { throughline: 'Strong', notes: '' },
}

const mockResume = {
  name: 'Test User',
  experience: [{ id: 'r0', company: 'Acme', title: 'Engineer', bullets: [
    { id: 'r0-b0', text: 'Did stuff' },
    { id: 'r0-b1', text: 'Made things' },
    { id: 'r0-b2', text: 'Old stuff' },
  ]}],
  education: [],
}

// Renders the hook and drives it to targeted state via a mocked SSE stream.
// Returns the hook result after state settles.
// unreviewedCount will be 4: 2 rewrites + 1 removal + 1 summary.
function renderAtTargeted() {
  mockOpenStream.mockImplementation(
    (_msg: unknown, _sessionId: unknown, onEvent: (e: unknown) => void) => {
      onEvent({ type: 'step_complete', step: 'targeted', data: { targeting: mockTargeting, summaryRewrite: { original: 'Original summary', rewritten: 'Rewritten summary' }, resume: mockResume } })
      onEvent({ type: 'done' })
      return () => {}
    }
  )

  const { result } = renderHook(() => useSession(null))

  act(() => {
    result.current.sendMessage({ type: 'text', content: 'start' })
  })

  return result
}

describe('useSession — bullet review actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts with unreviewedCount of 4 after targeted step (2 rewrites + 1 removal + 1 summary)', () => {
    const result = renderAtTargeted()
    expect(result.current.unreviewedCount).toBe(4)
  })

  it('acceptBullet sets review to true and decrements unreviewedCount', () => {
    const result = renderAtTargeted()
    act(() => { result.current.acceptBullet('r0-b0') })
    expect(result.current.bulletReviews['r0-b0']).toBe(true)
    expect(result.current.unreviewedCount).toBe(3)
  })

  it('acceptBullet does not decrement unreviewedCount on second call', () => {
    const result = renderAtTargeted()
    act(() => { result.current.acceptBullet('r0-b0') })
    act(() => { result.current.acceptBullet('r0-b0') })
    expect(result.current.unreviewedCount).toBe(3)
  })

  it('rejectBullet sets review to false and decrements unreviewedCount', () => {
    const result = renderAtTargeted()
    act(() => { result.current.rejectBullet('r0-b0') })
    expect(result.current.bulletReviews['r0-b0']).toBe(false)
    expect(result.current.unreviewedCount).toBe(3)
  })

  it('switching from accept to reject does not decrement again', () => {
    const result = renderAtTargeted()
    act(() => { result.current.acceptBullet('r0-b0') })
    act(() => { result.current.rejectBullet('r0-b0') })
    expect(result.current.unreviewedCount).toBe(3)
  })

  it('editBullet sets edit text, marks as accepted, and decrements unreviewedCount', () => {
    const result = renderAtTargeted()
    act(() => { result.current.editBullet('r0-b0', 'My custom text') })
    expect(result.current.bulletEdits['r0-b0']).toBe('My custom text')
    expect(result.current.bulletReviews['r0-b0']).toBe(true)
    expect(result.current.unreviewedCount).toBe(3)
  })

  it('editBullet does not decrement unreviewedCount if bullet was already reviewed', () => {
    const result = renderAtTargeted()
    act(() => { result.current.acceptBullet('r0-b0') })
    act(() => { result.current.editBullet('r0-b0', 'My custom text') })
    expect(result.current.unreviewedCount).toBe(3)
  })
})

describe('useSession — summary review actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('acceptSummary sets summaryReview to true and decrements unreviewedCount', () => {
    const result = renderAtTargeted()
    act(() => { result.current.acceptSummary() })
    expect(result.current.summaryReview).toBe(true)
    expect(result.current.unreviewedCount).toBe(3)
  })

  it('acceptSummary does not decrement unreviewedCount on second call', () => {
    const result = renderAtTargeted()
    act(() => { result.current.acceptSummary() })
    act(() => { result.current.acceptSummary() })
    expect(result.current.unreviewedCount).toBe(3)
  })

  it('rejectSummary sets summaryReview to false and decrements unreviewedCount', () => {
    const result = renderAtTargeted()
    act(() => { result.current.rejectSummary() })
    expect(result.current.summaryReview).toBe(false)
    expect(result.current.unreviewedCount).toBe(3)
  })

  it('switching from accept to reject does not decrement again', () => {
    const result = renderAtTargeted()
    act(() => { result.current.acceptSummary() })
    act(() => { result.current.rejectSummary() })
    expect(result.current.unreviewedCount).toBe(3)
  })

  it('editSummary sets summaryEdit and summaryReview to true and decrements unreviewedCount', () => {
    const result = renderAtTargeted()
    act(() => { result.current.editSummary('My edited summary') })
    expect(result.current.summaryEdit).toBe('My edited summary')
    expect(result.current.summaryReview).toBe(true)
    expect(result.current.unreviewedCount).toBe(3)
  })

  it('editSummary does not decrement unreviewedCount if summary was already reviewed', () => {
    const result = renderAtTargeted()
    act(() => { result.current.acceptSummary() })
    act(() => { result.current.editSummary('My edited summary') })
    expect(result.current.unreviewedCount).toBe(3)
  })
})
