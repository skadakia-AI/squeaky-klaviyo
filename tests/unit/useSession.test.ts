// @vitest-environment happy-dom
import { renderHook, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useSession } from '../../app/lib/session'
import type { StoredMessage } from '../../app/lib/types'

// ─── Mocks ────────────────────────────────────────────────────────────────────

// vi.mock factories are hoisted above variable declarations, so mock fns must
// be created with vi.hoisted() to be accessible inside the factory closures.
const { mockReplace, mockPush, mockFetchSessionById, mockOpenStream } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockPush: vi.fn(),
  mockFetchSessionById: vi.fn(),
  mockOpenStream: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}))

vi.mock('../../app/lib/api', () => ({
  fetchSessionById: mockFetchSessionById,
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

describe('useSession — lazy creation URL replacement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('replaces URL with real session ID after session_created fires in lazy mode', async () => {
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

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/session/new-sess-abc'))
    expect(result.current.sessionId).toBe('new-sess-abc')
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
