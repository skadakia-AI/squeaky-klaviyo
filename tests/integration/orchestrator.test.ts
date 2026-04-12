import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { OrchestratorEvent } from '../../app/lib/orchestrator'
import type { Resume } from '../../app/lib/types'

// ─── Mocks ────────────────────────────────────────────────────────────────────
// All external I/O is mocked. The orchestrator's routing logic runs for real.

vi.mock('../../app/lib/supabase', () => ({ getServiceClient: vi.fn() }))

vi.mock('../../app/lib/utils/messages', () => ({
  storeMessage: vi.fn().mockResolvedValue(undefined),
  fetchMessages: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../app/lib/utils/update-session', () => ({
  updateSession: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../app/lib/utils/storage', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  storagePath: vi.fn(),
}))

vi.mock('../../app/lib/utils/load-jd', () => ({
  loadJD: vi.fn(),
}))

vi.mock('../../app/lib/utils/load-resume', () => ({
  loadResume: vi.fn(),
}))

vi.mock('../../app/lib/utils/export-resume', () => ({
  exportResume: vi.fn(),
}))

vi.mock('../../app/lib/skills/jd-decoder', () => ({
  runJDDecoder: vi.fn(),
}))

vi.mock('../../app/lib/skills/jd-match', () => ({
  runJDMatchTurn1: vi.fn(),
  runJDMatchTurn1Continue: vi.fn(),
  runJDMatchTurn2: vi.fn(),
}))

vi.mock('../../app/lib/skills/resume-targeting', () => ({
  runResumeTargetingTurn1: vi.fn(),
  runResumeTargetingTurn2: vi.fn(),
}))

vi.mock('../../app/lib/intent-decoder', () => ({
  classifyIntent: vi.fn(),
}))

vi.mock('../../app/lib/handle-chat', () => ({
  handleChat: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../app/lib/utils/session-context', () => ({
  resolveSessionContext: vi.fn().mockResolvedValue(''),
}))

// ─── Imports (after mocks are registered) ────────────────────────────────────

import { runOrchestrator } from '../../app/lib/orchestrator'
import { loadJD } from '../../app/lib/utils/load-jd'
import { loadResume } from '../../app/lib/utils/load-resume'
import { exportResume } from '../../app/lib/utils/export-resume'
import { updateSession } from '../../app/lib/utils/update-session'
import { fetchMessages } from '../../app/lib/utils/messages'
import { readFile } from '../../app/lib/utils/storage'
import { runJDDecoder } from '../../app/lib/skills/jd-decoder'
import { runJDMatchTurn1, runJDMatchTurn1Continue, runJDMatchTurn2 } from '../../app/lib/skills/jd-match'
import { runResumeTargetingTurn1, runResumeTargetingTurn2 } from '../../app/lib/skills/resume-targeting'
import { classifyIntent } from '../../app/lib/intent-decoder'
import { handleChat } from '../../app/lib/handle-chat'
import { resolveSessionContext } from '../../app/lib/utils/session-context'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SESSION_ID = 'session-123'
const USER_ID = 'user-456'

function makeSession(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { current_step: 'created', user_id: USER_ID, ...overrides }
}

async function run(
  message: { type: 'text' | 'file_upload' | 'checkpoint'; content: string; file_name?: string; file_type?: string },
  session: Record<string, unknown>
): Promise<OrchestratorEvent[]> {
  const events: OrchestratorEvent[] = []
  await runOrchestrator(SESSION_ID, USER_ID, message, session, (e) => events.push(e))
  return events
}

const mockResume: Resume = {
  name: 'Test User',
  experience: [
    {
      id: 'r0', company: 'Acme Corp', title: 'Software Engineer',
      bullets: [{ id: 'r0-b0', text: 'Built things' }, { id: 'r0-b1', text: 'Fixed things' }],
    },
    {
      id: 'r1', company: 'Beta Inc', title: 'Senior Engineer',
      bullets: [{ id: 'r1-b0', text: 'Led team' }],
    },
  ],
  education: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: classify as confirm so existing routing tests fall through to step handlers.
  // Override in individual tests that need a different intent.
  vi.mocked(classifyIntent).mockResolvedValue({ action: 'confirm', confidence: 'high' })
})

// ─── created step ─────────────────────────────────────────────────────────────

describe('created step', () => {
  it('calls loadJD with type text for plain text input', async () => {
    vi.mocked(loadJD).mockResolvedValue({ success: true, rawText: 'Software Engineer at Acme...', sparse: false })
    vi.mocked(runJDDecoder).mockResolvedValue({ success: true, decodedText: '# JD Decoded', roleTitle: 'SWE', company: 'Acme', slug: 'acme-swe' })

    await run({ type: 'text', content: 'Software Engineer at Acme Corp...' }, makeSession())

    expect(vi.mocked(loadJD)).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'text', content: 'Software Engineer at Acme Corp...' })
    )
  })

  it('calls loadJD with type url when content starts with http', async () => {
    vi.mocked(loadJD).mockResolvedValue({ success: true, rawText: 'Senior Engineer...', sparse: false })
    vi.mocked(runJDDecoder).mockResolvedValue({ success: true, decodedText: '# JD Decoded', roleTitle: 'SWE', company: 'Acme', slug: 'acme-swe' })

    await run({ type: 'text', content: 'https://jobs.acme.com/swe' }, makeSession())

    expect(vi.mocked(loadJD)).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'url' })
    )
  })

  it('calls loadJD with type pdf for file_upload', async () => {
    vi.mocked(loadJD).mockResolvedValue({ success: true, rawText: 'Senior Engineer...', sparse: false })
    vi.mocked(runJDDecoder).mockResolvedValue({ success: true, decodedText: '# JD Decoded', roleTitle: 'SWE', company: 'Acme', slug: 'acme-swe' })

    await run({ type: 'file_upload', content: 'base64data==', file_type: 'pdf' }, makeSession())

    expect(vi.mocked(loadJD)).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'pdf' })
    )
  })

  it('advances directly to decoded without stopping at jd_loaded', async () => {
    vi.mocked(loadJD).mockResolvedValue({ success: true, rawText: 'Software Engineer...', sparse: false })
    vi.mocked(runJDDecoder).mockResolvedValue({ success: true, decodedText: '# JD Decoded', roleTitle: 'SWE', company: 'Acme', slug: 'acme-swe' })

    const events = await run({ type: 'text', content: 'some jd text' }, makeSession())

    expect(vi.mocked(updateSession)).toHaveBeenCalledWith(
      SESSION_ID, USER_ID, expect.objectContaining({ current_step: 'decoded' })
    )
    expect(events.some(e => e.type === 'step_complete' && e.step === 'decoded')).toBe(true)
    expect(events.some(e => e.type === 'step_complete' && e.step === 'jd_loaded')).toBe(false)
  })

  it('emits error and does not advance on loadJD failure', async () => {
    vi.mocked(loadJD).mockResolvedValue({ success: false, error: 'FETCH_FAILED', message: 'Could not fetch URL' })

    const events = await run({ type: 'text', content: 'https://bad-url.com' }, makeSession())

    expect(events.some(e => e.type === 'error')).toBe(true)
    expect(vi.mocked(updateSession)).not.toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.objectContaining({ current_step: 'jd_loaded' })
    )
  })
})

// ─── jd_loaded step (recovery) ────────────────────────────────────────────────

describe('jd_loaded step', () => {
  it('auto-resumes decode on any message (recovery path)', async () => {
    vi.mocked(runJDDecoder).mockResolvedValue({ success: true, decodedText: '# JD Decoded', roleTitle: 'SWE', company: 'Acme', slug: 'acme-swe' })

    const events = await run(
      { type: 'text', content: 'anything' },
      makeSession({ current_step: 'jd_loaded' })
    )

    expect(vi.mocked(runJDDecoder)).toHaveBeenCalled()
    expect(events.some(e => e.type === 'step_complete' && e.step === 'decoded')).toBe(true)
  })
})

// ─── decoded step ─────────────────────────────────────────────────────────────

describe('decoded step', () => {
  it('calls loadResume and runs jd-match Turn 1 on success', async () => {
    vi.mocked(loadResume).mockResolvedValue({ success: true, rawText: 'Resume text', resume: mockResume, short: false })
    vi.mocked(runJDMatchTurn1).mockResolvedValue({ success: true, arcText: 'Arc snapshot...' })

    await run(
      { type: 'file_upload', content: 'base64==', file_name: 'resume.pdf', file_type: 'pdf' },
      makeSession({ current_step: 'decoded' })
    )

    expect(vi.mocked(loadResume)).toHaveBeenCalled()
    expect(vi.mocked(runJDMatchTurn1)).toHaveBeenCalled()
  })

  it('advances to resume_loaded on success', async () => {
    vi.mocked(loadResume).mockResolvedValue({ success: true, rawText: 'Resume text', resume: mockResume, short: false })
    vi.mocked(runJDMatchTurn1).mockResolvedValue({ success: true, arcText: 'Arc snapshot...' })

    const events = await run(
      { type: 'text', content: 'paste resume text here' },
      makeSession({ current_step: 'decoded' })
    )

    expect(vi.mocked(updateSession)).toHaveBeenCalledWith(
      SESSION_ID, USER_ID, expect.objectContaining({ current_step: 'resume_loaded' })
    )
    expect(events.some(e => e.type === 'step_complete' && e.step === 'resume_loaded')).toBe(true)
  })

  it('emits error and does not advance on loadResume failure', async () => {
    vi.mocked(loadResume).mockResolvedValue({ success: false, error: 'PARSE_FAILED', message: 'Could not read PDF' })

    const events = await run(
      { type: 'file_upload', content: 'base64==', file_type: 'pdf' },
      makeSession({ current_step: 'decoded' })
    )

    expect(events.some(e => e.type === 'error')).toBe(true)
    expect(vi.mocked(updateSession)).not.toHaveBeenCalled()
    expect(vi.mocked(runJDMatchTurn1)).not.toHaveBeenCalled()
  })

  it('emits error if jd-match Turn 1 fails', async () => {
    vi.mocked(loadResume).mockResolvedValue({ success: true, rawText: 'Resume text', resume: mockResume, short: false })
    vi.mocked(runJDMatchTurn1).mockResolvedValue({ success: false, code: 'API_ERROR', message: 'Failed' })

    const events = await run(
      { type: 'text', content: 'paste resume text' },
      makeSession({ current_step: 'decoded' })
    )

    expect(events.some(e => e.type === 'error')).toBe(true)
  })
})

// ─── resume_loaded step ───────────────────────────────────────────────────────

describe('resume_loaded step', () => {
  const arcMessage = { role: 'assistant' as const, content: 'Here is your arc snapshot...' }

  it('runs Turn 1 continuation (not Turn 2) when message is a correction', async () => {
    vi.mocked(fetchMessages).mockResolvedValue([arcMessage])
    vi.mocked(runJDMatchTurn1Continue).mockResolvedValue({ success: true, arcText: 'Revised arc...' })

    await run(
      { type: 'text', content: 'actually I also ran ops' },
      makeSession({ current_step: 'resume_loaded' })
    )

    expect(vi.mocked(runJDMatchTurn1Continue)).toHaveBeenCalled()
    expect(vi.mocked(runJDMatchTurn2)).not.toHaveBeenCalled()
  })

  it('advances to assessed with verdict data on checkpoint confirm', async () => {
    vi.mocked(fetchMessages).mockResolvedValue([arcMessage])
    vi.mocked(runJDMatchTurn2).mockResolvedValue({
      success: true,
      assessmentText: 'Full assessment...',
      verdict: 'no-brainer',
      hard_req_status: 'all met',
      arc_alignment: 'strong',
      key_factors: 'Led infra',
    })

    const events = await run(
      { type: 'checkpoint', content: 'confirm' },
      makeSession({ current_step: 'resume_loaded' })
    )

    expect(vi.mocked(updateSession)).toHaveBeenCalledWith(
      SESSION_ID, USER_ID, expect.objectContaining({ current_step: 'assessed', verdict: 'no-brainer' })
    )
    expect(events.some(e => e.type === 'step_complete' && e.step === 'assessed')).toBe(true)
  })

  it('restarts Turn 1 silently when arc message is missing', async () => {
    vi.mocked(fetchMessages).mockResolvedValue([])
    vi.mocked(runJDMatchTurn1).mockResolvedValue({ success: true, arcText: 'Arc snapshot...' })

    const events = await run(
      { type: 'text', content: 'some response' },
      makeSession({ current_step: 'resume_loaded' })
    )

    expect(vi.mocked(runJDMatchTurn1)).toHaveBeenCalled()
    expect(vi.mocked(runJDMatchTurn2)).not.toHaveBeenCalled()
    expect(events.some(e => e.type === 'error')).toBe(false)
  })

  it('checkpoint correction bypasses intent classifier and continues Turn 1', async () => {
    vi.mocked(fetchMessages).mockResolvedValue([arcMessage])
    vi.mocked(runJDMatchTurn1Continue).mockResolvedValue({ success: true, arcText: 'Revised arc...' })

    await run(
      { type: 'checkpoint', content: "I haven't scaled yet — still building" },
      makeSession({ current_step: 'resume_loaded' })
    )

    expect(vi.mocked(classifyIntent)).not.toHaveBeenCalled()
    expect(vi.mocked(runJDMatchTurn1Continue)).toHaveBeenCalledWith(SESSION_ID, USER_ID, expect.any(Function))
    expect(vi.mocked(runJDMatchTurn2)).not.toHaveBeenCalled()
  })

  it('checkpoint confirm bypasses intent classifier and runs Turn 2', async () => {
    vi.mocked(fetchMessages).mockResolvedValue([arcMessage])
    vi.mocked(runJDMatchTurn2).mockResolvedValue({
      success: true,
      assessmentText: 'Full assessment...',
      verdict: 'no-brainer',
      hard_req_status: 'all met',
      arc_alignment: 'strong',
      key_factors: 'Led infra',
    })

    await run(
      { type: 'checkpoint', content: 'confirm' },
      makeSession({ current_step: 'resume_loaded' })
    )

    expect(vi.mocked(classifyIntent)).not.toHaveBeenCalled()
    expect(vi.mocked(runJDMatchTurn2)).toHaveBeenCalledWith(
      SESSION_ID, USER_ID, 'Confirmed, looks right.', expect.any(Function)
    )
  })

  it('emits error if Turn 2 fails', async () => {
    vi.mocked(fetchMessages).mockResolvedValue([arcMessage])
    vi.mocked(runJDMatchTurn2).mockResolvedValue({ success: false, code: 'API_ERROR', message: 'Failed' })

    const events = await run(
      { type: 'checkpoint', content: 'confirm' },
      makeSession({ current_step: 'resume_loaded' })
    )

    expect(events.some(e => e.type === 'error')).toBe(true)
    expect(vi.mocked(updateSession)).not.toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.objectContaining({ current_step: 'assessed' })
    )
  })

  it('emits error if Turn 1 continuation fails', async () => {
    vi.mocked(fetchMessages).mockResolvedValue([arcMessage])
    vi.mocked(runJDMatchTurn1Continue).mockResolvedValue({ success: false, code: 'API_ERROR', message: 'Failed' })

    const events = await run(
      { type: 'checkpoint', content: 'My correction here' },
      makeSession({ current_step: 'resume_loaded' })
    )

    expect(events.some(e => e.type === 'error')).toBe(true)
    expect(vi.mocked(runJDMatchTurn2)).not.toHaveBeenCalled()
  })
})

// ─── assessed step ────────────────────────────────────────────────────────────

describe('assessed step', () => {
  it('"pass" (classified as pass) advances to not_pursuing', async () => {
    vi.mocked(classifyIntent).mockResolvedValue({ action: 'pass', confidence: 'high' })

    const events = await run(
      { type: 'text', content: 'pass' },
      makeSession({ current_step: 'assessed', arc_alignment: 'strong' })
    )

    expect(vi.mocked(updateSession)).toHaveBeenCalledWith(
      SESSION_ID, USER_ID, expect.objectContaining({ current_step: 'not_pursuing' })
    )
    expect(events.some(e => e.type === 'step_complete' && e.step === 'not_pursuing')).toBe(true)
    expect(vi.mocked(runResumeTargetingTurn1)).not.toHaveBeenCalled()
  })

  it('"not pursuing" (classified as pass) advances to not_pursuing', async () => {
    vi.mocked(classifyIntent).mockResolvedValue({ action: 'pass', confidence: 'high' })

    const events = await run(
      { type: 'text', content: 'not pursuing' },
      makeSession({ current_step: 'assessed', arc_alignment: 'strong' })
    )
    expect(events.some(e => e.type === 'step_complete' && e.step === 'not_pursuing')).toBe(true)
  })

  it('proposes scope when no assistant messages exist yet', async () => {
    vi.mocked(fetchMessages).mockResolvedValue([])
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockResume))

    const events = await run(
      { type: 'text', content: 'yes, let\'s do it' },
      makeSession({ current_step: 'assessed', arc_alignment: 'strong' })
    )

    const messages = events.filter(e => e.type === 'message') as Extract<OrchestratorEvent, { type: 'message' }>[]
    expect(messages.some(m => m.content.includes("I'll rewrite"))).toBe(true)
    expect(vi.mocked(runResumeTargetingTurn1)).not.toHaveBeenCalled()
  })

  it('runs Turn 1 after scope is proposed and confirmed', async () => {
    vi.mocked(classifyIntent).mockResolvedValue({ action: 'scope_confirm', confidence: 'high' })
    const scopeMessage = { role: 'assistant' as const, content: "I'll rewrite Software Engineer at Acme Corp." }
    vi.mocked(fetchMessages).mockResolvedValue([scopeMessage])
    vi.mocked(runResumeTargetingTurn1).mockResolvedValue({ success: true, turn1Text: 'Bullet audit...', needsNumbers: false })
    vi.mocked(runResumeTargetingTurn2).mockResolvedValue({
      success: true,
      targetingOutput: { rewrites: [], flagged_for_removal: [] },
      bulletCount: 0,
      resume: mockResume,
    })
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockResume))

    await run(
      { type: 'text', content: 'yes' },
      makeSession({ current_step: 'assessed', arc_alignment: 'strong' })
    )

    expect(vi.mocked(runResumeTargetingTurn1)).toHaveBeenCalled()
  })

  it('runs Turn 2 immediately after Turn 1 if no numbers needed', async () => {
    vi.mocked(classifyIntent).mockResolvedValue({ action: 'scope_confirm', confidence: 'high' })
    const scopeMessage = { role: 'assistant' as const, content: "I'll rewrite Software Engineer at Acme Corp." }
    vi.mocked(fetchMessages).mockResolvedValue([scopeMessage])
    vi.mocked(runResumeTargetingTurn1).mockResolvedValue({ success: true, turn1Text: 'Audit complete.', needsNumbers: false })
    vi.mocked(runResumeTargetingTurn2).mockResolvedValue({
      success: true,
      targetingOutput: { rewrites: [], flagged_for_removal: [] },
      bulletCount: 0,
      resume: mockResume,
    })
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockResume))

    const events = await run(
      { type: 'text', content: 'yes' },
      makeSession({ current_step: 'assessed', arc_alignment: 'strong' })
    )

    expect(vi.mocked(runResumeTargetingTurn2)).toHaveBeenCalled()
    expect(events.some(e => e.type === 'step_complete' && e.step === 'targeted')).toBe(true)
  })

  it('waits for user numbers when Turn 1 asks for them', async () => {
    vi.mocked(classifyIntent).mockResolvedValue({ action: 'scope_confirm', confidence: 'high' })
    const scopeMessage = { role: 'assistant' as const, content: "I'll rewrite Software Engineer at Acme Corp." }
    vi.mocked(fetchMessages).mockResolvedValue([scopeMessage])
    vi.mocked(runResumeTargetingTurn1).mockResolvedValue({ success: true, turn1Text: 'Before I rewrite, I need a few numbers.', needsNumbers: true })
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockResume))

    const events = await run(
      { type: 'text', content: 'yes' },
      makeSession({ current_step: 'assessed', arc_alignment: 'strong' })
    )

    expect(vi.mocked(runResumeTargetingTurn2)).not.toHaveBeenCalled()
    expect(events.some(e => e.type === 'step_complete' && e.step === 'targeted')).toBe(false)
  })

  it('runs Turn 2 when user responds with numbers', async () => {
    vi.mocked(classifyIntent).mockResolvedValue({ action: 'numbers_response', confidence: 'high' })
    const numbersMessage = { role: 'assistant' as const, content: 'Before I rewrite, I need a few numbers.' }
    vi.mocked(fetchMessages).mockResolvedValue([
      { role: 'assistant' as const, content: "I'll rewrite Software Engineer at Acme Corp." },
      numbersMessage,
    ])
    vi.mocked(runResumeTargetingTurn2).mockResolvedValue({
      success: true,
      targetingOutput: { rewrites: [], flagged_for_removal: [] },
      bulletCount: 0,
      resume: mockResume,
    })

    const events = await run(
      { type: 'text', content: '3 people, $2M budget' },
      makeSession({ current_step: 'assessed', arc_alignment: 'strong' })
    )

    expect(vi.mocked(runResumeTargetingTurn2)).toHaveBeenCalled()
    expect(events.some(e => e.type === 'step_complete' && e.step === 'targeted')).toBe(true)
  })
})

// ─── targeted step ────────────────────────────────────────────────────────────

describe('targeted step', () => {
  it('calls exportResume and advances to exported', async () => {
    vi.mocked(exportResume).mockResolvedValue({ success: true, downloadUrl: 'https://storage.example.com/export.docx' })

    const events = await run(
      { type: 'text', content: 'download' },
      makeSession({ current_step: 'targeted' })
    )

    expect(vi.mocked(exportResume)).toHaveBeenCalled()
    expect(vi.mocked(updateSession)).toHaveBeenCalledWith(
      SESSION_ID, USER_ID, expect.objectContaining({ current_step: 'exported' })
    )
    expect(events.some(e => e.type === 'step_complete' && e.step === 'exported')).toBe(true)
  })

  it('emits error and does not advance if export fails', async () => {
    vi.mocked(exportResume).mockResolvedValue({ success: false, error: 'EXPORT_FAILED', message: 'Could not generate DOCX' })

    const events = await run(
      { type: 'text', content: 'download' },
      makeSession({ current_step: 'targeted' })
    )

    expect(events.some(e => e.type === 'error')).toBe(true)
    expect(vi.mocked(updateSession)).not.toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.objectContaining({ current_step: 'exported' })
    )
  })
})

// ─── Chat bypass ──────────────────────────────────────────────────────────────

describe('chat bypass', () => {
  it('routes to handleChat and does not run step handler when intent is chat', async () => {
    vi.mocked(classifyIntent).mockResolvedValue({ action: 'chat', confidence: 'high' })

    const events = await run(
      { type: 'text', content: 'what does arc alignment mean?' },
      makeSession({ current_step: 'decoded' })
    )

    expect(vi.mocked(handleChat)).toHaveBeenCalled()
    expect(vi.mocked(loadResume)).not.toHaveBeenCalled()
    expect(vi.mocked(updateSession)).not.toHaveBeenCalled()
    expect(events.some(e => e.type === 'step_complete')).toBe(false)
  })

  it('routes to handleChat when intent is unclear', async () => {
    vi.mocked(classifyIntent).mockResolvedValue({ action: 'unclear', confidence: 'low' })

    await run(
      { type: 'text', content: 'hmm' },
      makeSession({ current_step: 'resume_loaded' })
    )

    expect(vi.mocked(handleChat)).toHaveBeenCalled()
    expect(vi.mocked(runJDMatchTurn2)).not.toHaveBeenCalled()
  })

  it('calls resolveSessionContext before handleChat and passes the result', async () => {
    vi.mocked(classifyIntent).mockResolvedValue({ action: 'chat', confidence: 'high' })
    vi.mocked(resolveSessionContext).mockResolvedValue('## Decoded Job Description\nLead PM role...')

    await run(
      { type: 'text', content: 'tell me more about this role' },
      makeSession({ current_step: 'decoded' })
    )

    expect(vi.mocked(resolveSessionContext)).toHaveBeenCalledWith(USER_ID, SESSION_ID)
    expect(vi.mocked(handleChat)).toHaveBeenCalledWith(
      SESSION_ID, USER_ID,
      'tell me more about this role',
      'decoded',
      '## Decoded Job Description\nLead PM role...',
      expect.any(Function)
    )
  })

  it('skips classification for file uploads and routes directly', async () => {
    vi.mocked(loadResume).mockResolvedValue({ success: true, rawText: 'Resume', resume: mockResume, short: false })
    vi.mocked(runJDMatchTurn1).mockResolvedValue({ success: true, arcText: 'Arc...' })

    await run(
      { type: 'file_upload', content: 'base64==', file_type: 'pdf' },
      makeSession({ current_step: 'decoded' })
    )

    expect(vi.mocked(classifyIntent)).not.toHaveBeenCalled()
    expect(vi.mocked(loadResume)).toHaveBeenCalled()
  })

  it('skips classification for the created step', async () => {
    vi.mocked(loadJD).mockResolvedValue({ success: true, rawText: 'Some JD...', sparse: false })
    vi.mocked(runJDDecoder).mockResolvedValue({ success: true, decodedText: '# JD', roleTitle: 'SWE', company: 'Acme', slug: 'acme-swe' })

    await run(
      { type: 'text', content: 'some job description text' },
      makeSession({ current_step: 'created' })
    )

    expect(vi.mocked(classifyIntent)).not.toHaveBeenCalled()
  })
})

// ─── invalid / terminal states ────────────────────────────────────────────────

describe('terminal / invalid states', () => {
  it('emits INVALID_STATE error for an already-exported session', async () => {
    const events = await run(
      { type: 'text', content: 'hello' },
      makeSession({ current_step: 'exported' })
    )

    const error = events.find(e => e.type === 'error') as Extract<OrchestratorEvent, { type: 'error' }> | undefined
    expect(error).toBeDefined()
    expect(error?.code).toBe('INVALID_STATE')
  })
})
