import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('../../app/lib/anthropic', () => ({
  anthropic: {
    messages: {
      stream: vi.fn(),
      create: vi.fn(),
    },
  },
  MODELS: {
    analysis: 'claude-sonnet-4-6',
    parsing: 'claude-haiku-4-5-20251001',
  },
}))

vi.mock('../../app/lib/utils/storage', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  storagePath: vi.fn().mockReturnValue('users/u/s/file'),
}))

vi.mock('../../app/lib/utils/messages', () => ({
  storeMessage: vi.fn().mockResolvedValue(undefined),
  fetchMessages: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../app/lib/supabase', () => ({
  getServiceClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({ insert: vi.fn().mockResolvedValue({}) }),
  }),
}))

vi.mock('fs', () => ({
  default: { readFileSync: vi.fn().mockReturnValue('# skill prompt') },
  readFileSync: vi.fn().mockReturnValue('# skill prompt'),
}))

vi.mock('path', () => ({
  default: { join: vi.fn().mockReturnValue('/skills/resume-targeting.md') },
  join: vi.fn().mockReturnValue('/skills/resume-targeting.md'),
}))

import { runResumeTargetingTurn1, runResumeTargetingTurn2, parseQuantificationQuestions } from '../../app/lib/skills/resume-targeting'
import { anthropic } from '../../app/lib/anthropic'
import { readFile, writeFile } from '../../app/lib/utils/storage'
import { fetchMessages } from '../../app/lib/utils/messages'

const SESSION_ID = 'session-123'
const USER_ID = 'user-456'

async function* makeStream(text: string) {
  yield { type: 'content_block_delta', delta: { type: 'text_delta', text } }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(readFile).mockResolvedValue('{"name":"Test","experience":[],"education":[]}')
})

describe('parseQuantificationQuestions', () => {
  it('parses standard em-dash format', () => {
    const text = `Before I rewrite, I need a few numbers:

- Built a data pipeline for daily ETL — what was the data volume processed per day?
- Led migration to Kubernetes — what was the timeline and number of services migrated?

Rough estimates are fine.`
    const result = parseQuantificationQuestions(text)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      bullet: 'Built a data pipeline for daily ETL',
      question: 'what was the data volume processed per day?',
    })
    expect(result[1]).toEqual({
      bullet: 'Led migration to Kubernetes',
      question: 'what was the timeline and number of services migrated?',
    })
  })

  it('returns empty array when no questions are present', () => {
    const text = "No numbers needed — I'll start rewriting."
    expect(parseQuantificationQuestions(text)).toHaveLength(0)
  })

  it('handles en-dash separator variant', () => {
    const text = '- Reduced deployment time – what was the before/after in minutes?'
    const result = parseQuantificationQuestions(text)
    expect(result).toHaveLength(1)
    expect(result[0].question).toBe('what was the before/after in minutes?')
  })

  it('ignores non-list lines and prose', () => {
    const text = `Before I rewrite, I need a few numbers:

Some preamble here.

- Managed a team of engineers — how many direct reports?

Rough estimates are fine.`
    const result = parseQuantificationQuestions(text)
    expect(result).toHaveLength(1)
    expect(result[0].bullet).toBe('Managed a team of engineers')
  })
})

describe('runResumeTargetingTurn1', () => {
  it('includes TURN 1 INSTRUCTION in system prompt', async () => {
    vi.mocked(anthropic.messages.stream).mockReturnValue(makeStream('No numbers needed — I\'ll start rewriting.') as never)

    await runResumeTargetingTurn1(SESSION_ID, USER_ID, ['r0'], vi.fn())

    const call = vi.mocked(anthropic.messages.stream).mock.calls[0][0]
    expect(call.system).toContain('TURN 1 INSTRUCTION')
    expect(call.system).toContain('Steps 1, 2, and 3 ONLY')
    expect(call.system).toContain('DO NOT proceed to Steps 4, 5, or 6')
    expect(call.system).toContain('NEVER print bullet IDs')
  })

  it('returns needsNumbers true when output does not contain the "No numbers needed" confirmation', async () => {
    // LLM may vary the phrasing of the numbers request; we detect by absence of the controlled phrase
    vi.mocked(anthropic.messages.stream).mockReturnValue(makeStream('I need numbers to quantify your impact.') as never)

    const result = await runResumeTargetingTurn1(SESSION_ID, USER_ID, ['r0'], vi.fn())

    expect(result.success).toBe(true)
    if (result.success) expect(result.needsNumbers).toBe(true)
  })

  it('returns needsNumbers false when output contains "No numbers needed"', async () => {
    vi.mocked(anthropic.messages.stream).mockReturnValue(makeStream('No numbers needed — I\'ll start rewriting.') as never)

    const result = await runResumeTargetingTurn1(SESSION_ID, USER_ID, ['r0'], vi.fn())

    expect(result.success).toBe(true)
    if (result.success) expect(result.needsNumbers).toBe(false)
  })

  it('includes fit_assessment in user message when available', async () => {
    const fitAssessmentContent = '## Verdict\nverdict: stretch but doable\n\n## What Narrative Work Needs to Accomplish\nBridge the gap in domain depth.'
    vi.mocked(readFile)
      .mockResolvedValueOnce('decoded jd content')
      .mockResolvedValueOnce('{"name":"Test","experience":[],"education":[]}')
      .mockResolvedValueOnce(fitAssessmentContent)
    vi.mocked(anthropic.messages.stream).mockReturnValue(makeStream("No numbers needed — I'll start rewriting.") as never)

    await runResumeTargetingTurn1(SESSION_ID, USER_ID, ['r0'], vi.fn())

    const call = vi.mocked(anthropic.messages.stream).mock.calls[0][0]
    const userContent = (call.messages[0] as { content: string }).content
    expect(userContent).toContain('fit_assessment:')
    expect(userContent).toContain('stretch but doable')
    expect(userContent).toContain('Bridge the gap in domain depth')
  })

  it('proceeds without fit_assessment when it cannot be read', async () => {
    vi.mocked(readFile)
      .mockResolvedValueOnce('decoded jd content')
      .mockResolvedValueOnce('{"name":"Test","experience":[],"education":[]}')
      .mockRejectedValueOnce(new Error('storage: object not found'))
    vi.mocked(anthropic.messages.stream).mockReturnValue(makeStream("No numbers needed — I'll start rewriting.") as never)

    const result = await runResumeTargetingTurn1(SESSION_ID, USER_ID, ['r0'], vi.fn())

    expect(result.success).toBe(true)
    const call = vi.mocked(anthropic.messages.stream).mock.calls[0][0]
    const userContent = (call.messages[0] as { content: string }).content
    expect(userContent).not.toContain('fit_assessment:')
  })
})

describe('runResumeTargetingTurn2', () => {
  const validJson = JSON.stringify({
    role: 'SWE @ Acme',
    scope: ['r0'],
    rewrites: [{ bullet_id: 'r0-b0', original: 'Built things', rewritten: 'Delivered X', objective: 'growth', structure: 'A', unquantified: false }],
    flagged_for_removal: [],
    credibility_check: { throughline: 'strong', notes: '' },
  })

  it('includes TURN 2 INSTRUCTION in system prompt', async () => {
    vi.mocked(fetchMessages).mockResolvedValue([{ role: 'user', content: 'context' }])
    vi.mocked(anthropic.messages.create).mockResolvedValue({
      content: [{ type: 'text', text: `\`\`\`json\n${validJson}\n\`\`\`` }],
    } as never)
    vi.mocked(writeFile).mockResolvedValue(undefined)

    await runResumeTargetingTurn2(SESSION_ID, USER_ID)

    const call = vi.mocked(anthropic.messages.create).mock.calls[0][0]
    expect(call.system).toContain('TURN 2 INSTRUCTION')
    expect(call.system).toContain('Steps 4, 5, and 6')
  })
})
