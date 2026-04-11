import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('../../app/lib/utils/storage', () => ({
  readFile: vi.fn(),
}))

import { resolveSessionContext } from '../../app/lib/utils/session-context'
import { readFile } from '../../app/lib/utils/storage'

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockFile(filename: string, content: string) {
  vi.mocked(readFile).mockImplementation(async (userId, sessionId, name) => {
    if (name === filename) return content
    throw new Error(`File not found: ${name}`)
  })
}

function mockFiles(files: Record<string, string>) {
  vi.mocked(readFile).mockImplementation(async (userId, sessionId, name) => {
    if (name in files) return files[name]
    throw new Error(`File not found: ${name}`)
  })
}

function mockNone() {
  vi.mocked(readFile).mockRejectedValue(new Error('File not found'))
}

// ─── Basic loading ────────────────────────────────────────────────────────────

describe('basic loading', () => {
  it('returns empty string when no artifacts exist', async () => {
    mockNone()
    const result = await resolveSessionContext('u-1', 's-1')
    expect(result).toBe('')
  })

  it('returns formatted section for a single artifact', async () => {
    mockFile('decoded_jd.md', 'Lead PM role at State Street...')
    const result = await resolveSessionContext('u-1', 's-1')
    expect(result).toContain('## Decoded Job Description')
    expect(result).toContain('Lead PM role at State Street...')
  })

  it('skips files that do not exist without throwing', async () => {
    mockFiles({ 'decoded_jd.md': 'Some JD content' })
    const result = await resolveSessionContext('u-1', 's-1')
    expect(result).toContain('Decoded Job Description')
    expect(result).not.toContain('Resume')
    expect(result).not.toContain('Fit Assessment')
  })
})

// ─── Multiple artifacts ───────────────────────────────────────────────────────

describe('multiple artifacts', () => {
  it('includes all artifacts that exist', async () => {
    mockFiles({
      'decoded_jd.md':     'Decoded JD content',
      'resume_main.md':    'Resume content',
      'fit_assessment.md': 'Fit assessment content',
    })

    const result = await resolveSessionContext('u-1', 's-1')
    expect(result).toContain('Decoded Job Description')
    expect(result).toContain('Resume')
    expect(result).toContain('Fit Assessment')
  })

  it('returns artifacts in order: JD before resume before assessment', async () => {
    mockFiles({
      'decoded_jd.md':     'JD content',
      'resume_main.md':    'Resume content',
      'fit_assessment.md': 'Assessment content',
    })

    const result = await resolveSessionContext('u-1', 's-1')
    const jdIdx = result.indexOf('JD content')
    const resumeIdx = result.indexOf('Resume content')
    const assessmentIdx = result.indexOf('Assessment content')
    expect(jdIdx).toBeLessThan(resumeIdx)
    expect(resumeIdx).toBeLessThan(assessmentIdx)
  })
})

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('skips files with empty content', async () => {
    mockFiles({ 'decoded_jd.md': '   ' })
    const result = await resolveSessionContext('u-1', 's-1')
    expect(result).toBe('')
  })

  it('passes correct userId and sessionId to readFile', async () => {
    mockNone()
    await resolveSessionContext('user-abc', 'session-xyz')
    expect(vi.mocked(readFile)).toHaveBeenCalledWith('user-abc', 'session-xyz', expect.any(String))
  })
})
