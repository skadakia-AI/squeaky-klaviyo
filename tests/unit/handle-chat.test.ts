import { vi, describe, it, expect, beforeEach } from 'vitest'

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
  storeMessage: vi.fn().mockResolvedValue(undefined),
}))

import { handleChat } from '../../app/lib/handle-chat'
import { anthropic } from '../../app/lib/anthropic'
import { storeMessage } from '../../app/lib/utils/messages'

// ─── Helpers ──────────────────────────────────────────────────────────────────

type EmittedEvent =
  | { type: 'token'; content: string }
  | { type: 'message'; role: 'assistant'; content: string }
  | { type: 'error'; code: string; message: string }

// Creates a mock async generator that yields text chunks as SSE stream events
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
})

// ─── Token streaming ──────────────────────────────────────────────────────────

describe('token streaming', () => {
  it('emits token events for each chunk', async () => {
    mockStream('Arc ', 'alignment ', 'means...')
    const events: EmittedEvent[] = []
    await handleChat('s-1', 'u-1', 'what is arc alignment?', 'jd_loaded', '', (e) => events.push(e as EmittedEvent))

    const tokens = events.filter(e => e.type === 'token') as { type: 'token'; content: string }[]
    expect(tokens).toHaveLength(3)
    expect(tokens.map(t => t.content).join('')).toBe('Arc alignment means...')
  })

  it('emits tokens in order', async () => {
    mockStream('first', ' second', ' third')
    const events: EmittedEvent[] = []
    await handleChat('s-1', 'u-1', 'explain something', null, '', (e) => events.push(e as EmittedEvent))

    const tokens = events.filter(e => e.type === 'token') as { type: 'token'; content: string }[]
    expect(tokens[0].content).toBe('first')
    expect(tokens[1].content).toBe(' second')
    expect(tokens[2].content).toBe(' third')
  })
})

// ─── Message storage ──────────────────────────────────────────────────────────

describe('message storage', () => {
  it('stores the completed reply as an assistant message', async () => {
    mockStream('Hello ', 'there.')
    await handleChat('s-1', 'u-1', 'hi', null, '', () => {})

    expect(vi.mocked(storeMessage)).toHaveBeenCalledWith('s-1', 'assistant', 'Hello there.', 'chat')
  })

  it('does not store a message when the stream returns nothing', async () => {
    mockStream()
    await handleChat('s-1', 'u-1', 'hi', null, '', () => {})

    expect(vi.mocked(storeMessage)).not.toHaveBeenCalled()
  })
})

// ─── No reminder bubble ───────────────────────────────────────────────────────

describe('no reminder bubble', () => {
  it('does not emit a message event after streaming, regardless of context', async () => {
    const contexts: Parameters<typeof handleChat>[3][] = [
      'jd_loaded', 'decoded', 'resume_loaded',
      'assessed_pursue_or_pass', 'assessed_scope', 'assessed_numbers', null,
    ]
    for (const context of contexts) {
      vi.clearAllMocks()
      mockStream('Response.')
      const events: EmittedEvent[] = []
      await handleChat('s-1', 'u-1', 'question', context, '', (e) => events.push(e as EmittedEvent))
      expect(events.filter(e => e.type === 'message')).toHaveLength(0)
    }
  })
})

// ─── Per-context system prompt ────────────────────────────────────────────────

describe('per-context system prompt', () => {
  it('decoded context includes broad role-discussion scope', async () => {
    mockStream('Response.')
    await handleChat('s-1', 'u-1', 'what does this role want?', 'decoded', '', () => {})

    const call = vi.mocked(anthropic.messages.stream).mock.calls[0][0]
    expect(call.system).toContain('strong candidates')
    expect(call.system).toContain('resume')
  })

  it('resume_loaded context scopes to arc snapshot discussion', async () => {
    mockStream('Response.')
    await handleChat('s-1', 'u-1', 'what does arc mean?', 'resume_loaded', '', () => {})

    const call = vi.mocked(anthropic.messages.stream).mock.calls[0][0]
    expect(call.system).toContain('arc snapshot')
  })

  it('null context still produces a valid system prompt', async () => {
    mockStream('Response.')
    await handleChat('s-1', 'u-1', 'question', null, '', () => {})

    const call = vi.mocked(anthropic.messages.stream).mock.calls[0][0]
    expect(call.system).toBeTruthy()
  })
})

// ─── Artifact context ─────────────────────────────────────────────────────────

describe('artifact context', () => {
  it('injects artifact context into the system prompt when provided', async () => {
    mockStream('Response.')
    await handleChat('s-1', 'u-1', 'question', 'decoded', '## Decoded Job Description\nLead PM role...', () => {})

    const call = vi.mocked(anthropic.messages.stream).mock.calls[0][0]
    expect(call.system).toContain('## Decoded Job Description')
    expect(call.system).toContain('Lead PM role...')
  })

  it('does not add artifact context section when artifactContext is empty', async () => {
    mockStream('Response.')
    await handleChat('s-1', 'u-1', 'question', 'decoded', '', () => {})

    const call = vi.mocked(anthropic.messages.stream).mock.calls[0][0]
    expect(call.system).not.toContain('## Session context')
  })
})

// ─── Error handling ───────────────────────────────────────────────────────────

describe('error handling', () => {
  it('emits an error event when the LLM call throws', async () => {
    vi.mocked(anthropic.messages.stream).mockImplementation(() => {
      throw new Error('API error')
    })
    const events: EmittedEvent[] = []
    await handleChat('s-1', 'u-1', 'question', 'jd_loaded', '', (e) => events.push(e as EmittedEvent))

    const error = events.find(e => e.type === 'error') as { type: 'error'; code: string } | undefined
    expect(error).toBeDefined()
    expect(error?.code).toBe('CHAT_ERROR')
  })

  it('does not store a message or append a reminder when the LLM call throws', async () => {
    vi.mocked(anthropic.messages.stream).mockImplementation(() => {
      throw new Error('API error')
    })
    const events: EmittedEvent[] = []
    await handleChat('s-1', 'u-1', 'question', 'jd_loaded', '', (e) => events.push(e as EmittedEvent))

    expect(vi.mocked(storeMessage)).not.toHaveBeenCalled()
    expect(events.filter(e => e.type === 'message')).toHaveLength(0)
  })
})
