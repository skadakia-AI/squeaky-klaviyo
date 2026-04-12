import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('../../app/lib/anthropic', () => ({
  anthropic: {
    messages: {
      create: vi.fn(),
    },
  },
  MODELS: {
    analysis: 'claude-sonnet-4-6',
    parsing:  'claude-haiku-4-5-20251001',
  },
}))

import { classifyIntent } from '../../app/lib/intent-decoder'
import { anthropic } from '../../app/lib/anthropic'

// ─── Helper ───────────────────────────────────────────────────────────────────

function mockLLMResponse(action: string, confidence: 'high' | 'low' = 'high') {
  vi.mocked(anthropic.messages.create).mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify({ action, confidence }) }],
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── jd_loaded ────────────────────────────────────────────────────────────────

describe('jd_loaded context', () => {
  it('returns confirm when LLM classifies as confirm', async () => {
    mockLLMResponse('confirm')
    const result = await classifyIntent('jd_loaded', 'yes that looks right')
    expect(result).toEqual({ action: 'confirm', confidence: 'high' })
  })

  it('returns reject when LLM classifies as reject', async () => {
    mockLLMResponse('reject')
    const result = await classifyIntent('jd_loaded', "that's not the right job")
    expect(result).toEqual({ action: 'reject', confidence: 'high' })
  })

  it('returns chat when LLM classifies as chat', async () => {
    mockLLMResponse('chat')
    const result = await classifyIntent('jd_loaded', 'what does sparse mean?')
    expect(result).toEqual({ action: 'chat', confidence: 'high' })
  })

  it('returns unclear when LLM classifies as unclear', async () => {
    mockLLMResponse('unclear')
    const result = await classifyIntent('jd_loaded', 'hmm')
    expect(result).toEqual({ action: 'unclear', confidence: 'high' })
  })

  it('returns unclear when LLM returns an action not valid for this context', async () => {
    // 'pass' is not a valid action at jd_loaded
    mockLLMResponse('pass')
    const result = await classifyIntent('jd_loaded', 'pass')
    expect(result).toEqual({ action: 'unclear', confidence: 'low' })
  })

  it('preserves low confidence from LLM', async () => {
    mockLLMResponse('confirm', 'low')
    const result = await classifyIntent('jd_loaded', 'maybe')
    expect(result).toEqual({ action: 'confirm', confidence: 'low' })
  })
})

// ─── resume_loaded ────────────────────────────────────────────────────────────

describe('resume_loaded context', () => {
  it('returns confirm', async () => {
    mockLLMResponse('confirm')
    const result = await classifyIntent('resume_loaded', 'yes that is accurate')
    expect(result).toEqual({ action: 'confirm', confidence: 'high' })
  })

  it('returns chat for a question', async () => {
    mockLLMResponse('chat')
    const result = await classifyIntent('resume_loaded', "what's an arc snapshot?")
    expect(result).toEqual({ action: 'chat', confidence: 'high' })
  })

  it('returns unclear when LLM returns reject, which is not valid here', async () => {
    mockLLMResponse('reject')
    const result = await classifyIntent('resume_loaded', 'reject')
    expect(result).toEqual({ action: 'unclear', confidence: 'low' })
  })
})

// ─── assessed_pursue_or_pass ──────────────────────────────────────────────────

describe('assessed_pursue_or_pass context', () => {
  it('returns confirm for pursue intent', async () => {
    mockLLMResponse('confirm')
    const result = await classifyIntent('assessed_pursue_or_pass', "let's do it")
    expect(result).toEqual({ action: 'confirm', confidence: 'high' })
  })

  it('returns pass', async () => {
    mockLLMResponse('pass')
    const result = await classifyIntent('assessed_pursue_or_pass', "not pursuing this one")
    expect(result).toEqual({ action: 'pass', confidence: 'high' })
  })

  it('returns chat for a question about the verdict', async () => {
    mockLLMResponse('chat')
    const result = await classifyIntent('assessed_pursue_or_pass', "what does stretch but doable mean?")
    expect(result).toEqual({ action: 'chat', confidence: 'high' })
  })

  it('returns unclear for ambiguous response', async () => {
    mockLLMResponse('unclear')
    const result = await classifyIntent('assessed_pursue_or_pass', "I'm not sure")
    expect(result).toEqual({ action: 'unclear', confidence: 'high' })
  })

  it('returns unclear when LLM returns scope_confirm, not valid here', async () => {
    mockLLMResponse('scope_confirm')
    const result = await classifyIntent('assessed_pursue_or_pass', 'ok')
    expect(result).toEqual({ action: 'unclear', confidence: 'low' })
  })
})

// ─── assessed_scope ───────────────────────────────────────────────────────────

describe('assessed_scope context', () => {
  it('returns scope_confirm', async () => {
    mockLLMResponse('scope_confirm')
    const result = await classifyIntent('assessed_scope', 'that scope works')
    expect(result).toEqual({ action: 'scope_confirm', confidence: 'high' })
  })

  it('returns scope_add', async () => {
    mockLLMResponse('scope_add')
    const result = await classifyIntent('assessed_scope', 'also include my internship')
    expect(result).toEqual({ action: 'scope_add', confidence: 'high' })
  })

  it('returns chat for a question about scope', async () => {
    mockLLMResponse('chat')
    const result = await classifyIntent('assessed_scope', 'why only two roles?')
    expect(result).toEqual({ action: 'chat', confidence: 'high' })
  })

  it('returns unclear when LLM returns confirm, not valid here', async () => {
    mockLLMResponse('confirm')
    const result = await classifyIntent('assessed_scope', 'yes')
    expect(result).toEqual({ action: 'unclear', confidence: 'low' })
  })
})

// ─── assessed_numbers ─────────────────────────────────────────────────────────

describe('assessed_numbers context', () => {
  it('returns numbers_response when user provides metrics', async () => {
    mockLLMResponse('numbers_response')
    const result = await classifyIntent('assessed_numbers', '3 engineers, $1.2M revenue impact')
    expect(result).toEqual({ action: 'numbers_response', confidence: 'high' })
  })

  it('returns numbers_response even when user says they have no numbers', async () => {
    mockLLMResponse('numbers_response')
    const result = await classifyIntent('assessed_numbers', "I don't have exact numbers")
    expect(result).toEqual({ action: 'numbers_response', confidence: 'high' })
  })

  it('returns numbers_response for "skip for now"', async () => {
    mockLLMResponse('numbers_response')
    const result = await classifyIntent('assessed_numbers', 'skip for now')
    expect(result).toEqual({ action: 'numbers_response', confidence: 'high' })
  })

  it('returns numbers_response for "just go ahead"', async () => {
    mockLLMResponse('numbers_response')
    const result = await classifyIntent('assessed_numbers', 'just go ahead')
    expect(result).toEqual({ action: 'numbers_response', confidence: 'high' })
  })

  it('returns chat when user asks why numbers are needed', async () => {
    mockLLMResponse('chat')
    const result = await classifyIntent('assessed_numbers', 'why do you need these?')
    expect(result).toEqual({ action: 'chat', confidence: 'high' })
  })
})

// ─── Failure modes ────────────────────────────────────────────────────────────

describe('failure modes', () => {
  it('returns { action: chat, confidence: low } when the API throws', async () => {
    vi.mocked(anthropic.messages.create).mockRejectedValue(new Error('Network error'))
    const result = await classifyIntent('jd_loaded', 'yes')
    expect(result).toEqual({ action: 'chat', confidence: 'low' })
  })

  it('returns { action: unclear, confidence: low } when LLM returns malformed JSON', async () => {
    vi.mocked(anthropic.messages.create).mockResolvedValue({
      content: [{ type: 'text', text: 'not json at all' }],
    } as never)
    const result = await classifyIntent('jd_loaded', 'yes')
    expect(result).toEqual({ action: 'unclear', confidence: 'low' })
  })

  it('returns { action: unclear, confidence: low } when LLM returns empty content', async () => {
    vi.mocked(anthropic.messages.create).mockResolvedValue({
      content: [{ type: 'text', text: '' }],
    } as never)
    const result = await classifyIntent('jd_loaded', 'yes')
    expect(result).toEqual({ action: 'unclear', confidence: 'low' })
  })

  it('returns { action: unclear, confidence: low } when action field is missing from JSON', async () => {
    vi.mocked(anthropic.messages.create).mockResolvedValue({
      content: [{ type: 'text', text: '{"confidence":"high"}' }],
    } as never)
    const result = await classifyIntent('jd_loaded', 'yes')
    expect(result).toEqual({ action: 'unclear', confidence: 'low' })
  })

  it('returns { action: unclear, confidence: low } when LLM returns action invalid for the context', async () => {
    // 'numbers_response' is only valid at assessed_numbers, not jd_loaded
    mockLLMResponse('numbers_response')
    const result = await classifyIntent('jd_loaded', 'here are my numbers')
    expect(result).toEqual({ action: 'unclear', confidence: 'low' })
  })
})

// ─── Prompt construction ──────────────────────────────────────────────────────
// Verify the LLM is called with context-appropriate content — not the exact
// wording, but that the right actions appear in the prompt for each context.

describe('prompt construction', () => {
  it('includes context-specific valid actions in the prompt for jd_loaded', async () => {
    mockLLMResponse('confirm')
    await classifyIntent('jd_loaded', 'yes')

    const call = vi.mocked(anthropic.messages.create).mock.calls[0][0]
    const userPrompt = (call.messages[0] as { role: string; content: string }).content
    expect(userPrompt).toContain('"confirm"')
    expect(userPrompt).toContain('"reject"')
    expect(userPrompt).not.toContain('"pass"')
    expect(userPrompt).not.toContain('"scope_confirm"')
  })

  it('includes context-specific valid actions in the prompt for assessed_pursue_or_pass', async () => {
    mockLLMResponse('confirm')
    await classifyIntent('assessed_pursue_or_pass', 'yes')

    const call = vi.mocked(anthropic.messages.create).mock.calls[0][0]
    const userPrompt = (call.messages[0] as { role: string; content: string }).content
    expect(userPrompt).toContain('"confirm"')
    expect(userPrompt).toContain('"pass"')
    expect(userPrompt).not.toContain('"reject"')
    expect(userPrompt).not.toContain('"scope_confirm"')
  })

  it('includes the user message verbatim in the prompt', async () => {
    mockLLMResponse('confirm')
    const message = 'this is my exact message'
    await classifyIntent('jd_loaded', message)

    const call = vi.mocked(anthropic.messages.create).mock.calls[0][0]
    const userPrompt = (call.messages[0] as { role: string; content: string }).content
    expect(userPrompt).toContain(message)
  })
})
