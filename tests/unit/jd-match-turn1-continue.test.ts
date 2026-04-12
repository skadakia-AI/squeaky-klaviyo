import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('../../app/lib/supabase', () => ({ getServiceClient: vi.fn() }))

vi.mock('../../app/lib/utils/storage', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  storagePath: vi.fn(),
}))

vi.mock('../../app/lib/anthropic', () => ({
  anthropic: {
    messages: {
      stream: vi.fn(),
    },
  },
  MODELS: {
    analysis: 'claude-sonnet-4-6',
    parsing:  'claude-haiku-4-5-20251001',
  },
}))

vi.mock('../../app/lib/utils/messages', () => ({
  fetchMessages: vi.fn(),
  storeMessage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('fs', () => ({
  default: { readFileSync: vi.fn().mockReturnValue('# Skill prompt text') },
}))

vi.mock('path', () => ({
  default: { join: vi.fn().mockReturnValue('/fake/path/jd-match.md') },
}))

import { runJDMatchTurn1Continue } from '../../app/lib/skills/jd-match'
import { anthropic } from '../../app/lib/anthropic'
import { fetchMessages, storeMessage } from '../../app/lib/utils/messages'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SESSION_ID = 'session-123'
const USER_ID = 'user-456'

const HISTORY = [
  { role: 'user' as const, content: 'decoded_jd: ...\nresume: ...' },
  { role: 'assistant' as const, content: 'Here is your arc snapshot...' },
  { role: 'user' as const, content: 'Actually I also ran ops' },
]

function mockStream(...chunks: string[]) {
  vi.mocked(anthropic.messages.stream).mockReturnValue(
    (async function* () {
      for (const text of chunks) {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text } }
      }
    })() as never
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchMessages).mockResolvedValue(HISTORY)
})

// ─── Token streaming ──────────────────────────────────────────────────────────

describe('token streaming', () => {
  it('emits token events for each chunk', async () => {
    mockStream('Revised ', 'arc ', 'snapshot.')
    const tokens: string[] = []
    await runJDMatchTurn1Continue(SESSION_ID, USER_ID, (e) => {
      if (e.type === 'token') tokens.push(e.content)
    })

    expect(tokens).toHaveLength(3)
    expect(tokens.join('')).toBe('Revised arc snapshot.')
  })

  it('passes existing history to the LLM without adding duplicate messages', async () => {
    mockStream('Revised arc.')
    await runJDMatchTurn1Continue(SESSION_ID, USER_ID, () => {})

    const call = vi.mocked(anthropic.messages.stream).mock.calls[0][0]
    expect(call.messages).toEqual(HISTORY)
  })
})

// ─── Message storage ──────────────────────────────────────────────────────────

describe('message storage', () => {
  it('stores the revised arc as an assistant message under resume_loaded', async () => {
    mockStream('Revised arc snapshot.')
    await runJDMatchTurn1Continue(SESSION_ID, USER_ID, () => {})

    expect(vi.mocked(storeMessage)).toHaveBeenCalledWith(
      SESSION_ID, 'assistant', 'Revised arc snapshot.', 'resume_loaded'
    )
  })

  it('does not store a user message (correction already in DB)', async () => {
    mockStream('Revised arc snapshot.')
    await runJDMatchTurn1Continue(SESSION_ID, USER_ID, () => {})

    const userCalls = vi.mocked(storeMessage).mock.calls.filter(c => c[1] === 'user')
    expect(userCalls).toHaveLength(0)
  })
})

// ─── Missing history ──────────────────────────────────────────────────────────

describe('missing history', () => {
  it('returns MISSING_HISTORY when no history exists', async () => {
    vi.mocked(fetchMessages).mockResolvedValue([])

    const result = await runJDMatchTurn1Continue(SESSION_ID, USER_ID, () => {})

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('MISSING_HISTORY')
    expect(vi.mocked(anthropic.messages.stream)).not.toHaveBeenCalled()
  })
})

// ─── Error handling ───────────────────────────────────────────────────────────

describe('error handling', () => {
  it('returns RATE_LIMITED on 429 from the API', async () => {
    vi.mocked(anthropic.messages.stream).mockImplementation(() => {
      const err = new Error('Rate limited') as Error & { status: number }
      err.status = 429
      throw err
    })

    const result = await runJDMatchTurn1Continue(SESSION_ID, USER_ID, () => {})

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('RATE_LIMITED')
  })

  it('returns API_ERROR on other API failures', async () => {
    vi.mocked(anthropic.messages.stream).mockImplementation(() => {
      throw new Error('Internal server error')
    })

    const result = await runJDMatchTurn1Continue(SESSION_ID, USER_ID, () => {})

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('API_ERROR')
  })

  it('does not store a message when the API call fails', async () => {
    vi.mocked(anthropic.messages.stream).mockImplementation(() => {
      throw new Error('API error')
    })

    await runJDMatchTurn1Continue(SESSION_ID, USER_ID, () => {})

    expect(vi.mocked(storeMessage)).not.toHaveBeenCalled()
  })
})
