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

// ─── Reminder behavior ────────────────────────────────────────────────────────

describe('pending reminder', () => {
  it('appends a reminder message when context is provided', async () => {
    mockStream('Good question.')
    const events: EmittedEvent[] = []
    await handleChat('s-1', 'u-1', 'what does sparse mean?', 'jd_loaded', '', (e) => events.push(e as EmittedEvent))

    const messages = events.filter(e => e.type === 'message') as { type: 'message'; content: string }[]
    expect(messages).toHaveLength(1)
    expect(messages[0].content).toContain('job description')
  })

  it('appends the correct reminder for each context', async () => {
    const contexts: Array<{ context: Parameters<typeof handleChat>[3]; keyword: string }> = [
      { context: 'jd_loaded',               keyword: 'job description' },
      { context: 'decoded',                  keyword: 'resume'          },
      { context: 'resume_loaded',            keyword: 'arc snapshot'    },
      { context: 'assessed_pursue_or_pass',  keyword: 'target'          },
      { context: 'assessed_scope',           keyword: 'scope'           },
      { context: 'assessed_numbers',         keyword: 'numbers'         },
    ]

    for (const { context, keyword } of contexts) {
      vi.clearAllMocks()
      mockStream('Response.')
      const events: EmittedEvent[] = []
      await handleChat('s-1', 'u-1', 'question', context, '', (e) => events.push(e as EmittedEvent))

      const messages = events.filter(e => e.type === 'message') as { type: 'message'; content: string }[]
      expect(messages).toHaveLength(1)
      expect(messages[0].content.toLowerCase()).toContain(keyword)
    }
  })

  it('does not append a reminder when context is null', async () => {
    mockStream('Response.')
    const events: EmittedEvent[] = []
    await handleChat('s-1', 'u-1', 'question', null, '', (e) => events.push(e as EmittedEvent))

    const messages = events.filter(e => e.type === 'message')
    expect(messages).toHaveLength(0)
  })

  it('reminder comes after the streamed tokens, not before', async () => {
    mockStream('The answer is...')
    const events: EmittedEvent[] = []
    await handleChat('s-1', 'u-1', 'explain arc alignment', 'resume_loaded', '', (e) => events.push(e as EmittedEvent))

    const lastToken = [...events].reverse().find(e => e.type === 'token')
    const reminder = events.find(e => e.type === 'message')
    const lastTokenIdx = events.lastIndexOf(lastToken!)
    const reminderIdx = events.indexOf(reminder!)
    expect(reminderIdx).toBeGreaterThan(lastTokenIdx)
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
