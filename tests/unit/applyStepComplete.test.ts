import { describe, it, expect } from 'vitest'
import { applyStepComplete, applyDone, parseVerdictFromText, buildTargetedViewState, computeUnreviewedCount } from '../../app/lib/session'
import type { ClientState, ChatMessage, CurrentStep } from '../../app/lib/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildState(overrides: Partial<ClientState> = {}): ClientState {
  return {
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
    excludedOutOfScopeRoles: [],
    quantificationQuestions: null,
    summaryReview: undefined,
    summaryEdit: undefined,
    error: null,
    ...overrides,
  }
}

function buildMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    role: 'assistant',
    content: 'test content',
    type: 'text',
    timestamp: 0,
    ...overrides,
  }
}

// ─── jd_loaded ────────────────────────────────────────────────────────────────

describe('jd_loaded', () => {
  it('sets currentStep without setting a checkpoint', () => {
    const state = buildState()
    const next = applyStepComplete(state, 'jd_loaded')
    expect(next.currentStep).toBe('jd_loaded')
    expect(next.checkpoint).toBeNull()
  })
})

// ─── decoded ──────────────────────────────────────────────────────────────────

describe('decoded', () => {
  it('promotes the last assistant text message to jd_decode_card', () => {
    const state = buildState({
      messages: [buildMessage({ role: 'assistant', type: 'text', content: '# JD Decoded...' })],
    })
    const next = applyStepComplete(state, 'decoded')
    expect(next.messages[0].type).toBe('jd_decode_card')
  })

  it('only promotes the last assistant text message when multiple exist', () => {
    const state = buildState({
      messages: [
        buildMessage({ id: 'a', role: 'assistant', type: 'text', content: 'first' }),
        buildMessage({ id: 'b', role: 'assistant', type: 'text', content: 'last' }),
      ],
    })
    const next = applyStepComplete(state, 'decoded')
    expect(next.messages[0].type).toBe('text')
    expect(next.messages[1].type).toBe('jd_decode_card')
  })

  it('skips non-text assistant messages when finding the last one', () => {
    const state = buildState({
      messages: [
        buildMessage({ id: 'a', role: 'assistant', type: 'text', content: 'the one' }),
        buildMessage({ id: 'b', role: 'assistant', type: 'progress', content: 'Decoding...' }),
      ],
    })
    const next = applyStepComplete(state, 'decoded')
    expect(next.messages[0].type).toBe('jd_decode_card')
    expect(next.messages[1].type).toBe('progress')
  })

  it('leaves messages unchanged when there are no assistant text messages', () => {
    const state = buildState({
      messages: [buildMessage({ role: 'user', type: 'text', content: 'here is the jd' })],
    })
    const next = applyStepComplete(state, 'decoded')
    expect(next.messages[0].type).toBe('text')
  })

  it('sets currentStep to decoded and clears checkpoint', () => {
    const state = buildState({ checkpoint: 'arc_confirmation' })
    const next = applyStepComplete(state, 'decoded')
    expect(next.currentStep).toBe('decoded')
    expect(next.checkpoint).toBeNull()
  })
})

// ─── resume_loaded ────────────────────────────────────────────────────────────

describe('resume_loaded', () => {
  it('sets currentStep', () => {
    const state = buildState()
    const next = applyStepComplete(state, 'resume_loaded')
    expect(next.currentStep).toBe('resume_loaded')
  })
})

// ─── assessed ─────────────────────────────────────────────────────────────────

describe('assessed', () => {
  const assessmentData = {
    verdict: 'no-brainer' as const,
    hard_req_status: 'all met',
    arc_alignment: 'strong' as const,
    key_factors: 'Led infra at scale',
  }

  it('promotes last assistant text message to fit_assessment_card with data', () => {
    const state = buildState({
      messages: [buildMessage({ role: 'assistant', type: 'text', content: 'You are a strong fit...' })],
    })
    const next = applyStepComplete(state, 'assessed', assessmentData)
    expect(next.messages[0].type).toBe('fit_assessment_card')
    expect((next.messages[0].data as { verdict: string })?.verdict).toBe('no-brainer')
    expect((next.messages[0].data as { arc_alignment: string })?.arc_alignment).toBe('strong')
  })

  it('attaches full_text from the original message content', () => {
    const originalContent = 'You are a strong fit...'
    const state = buildState({
      messages: [buildMessage({ role: 'assistant', type: 'text', content: originalContent })],
    })
    const next = applyStepComplete(state, 'assessed', assessmentData)
    expect((next.messages[0].data as { full_text: string })?.full_text).toBe(originalContent)
  })

  it('does not promote if data is missing', () => {
    const state = buildState({
      messages: [buildMessage({ role: 'assistant', type: 'text' })],
    })
    const next = applyStepComplete(state, 'assessed', undefined)
    expect(next.messages[0].type).toBe('text')
  })

  it('sets checkpoint to pursue_or_pass', () => {
    const state = buildState()
    const next = applyStepComplete(state, 'assessed', assessmentData)
    expect(next.checkpoint).toBe('pursue_or_pass')
  })

  it('sets currentStep to assessed', () => {
    const state = buildState()
    const next = applyStepComplete(state, 'assessed', assessmentData)
    expect(next.currentStep).toBe('assessed')
  })
})

// ─── not_pursuing ─────────────────────────────────────────────────────────────

describe('not_pursuing', () => {
  it('sets currentStep and clears checkpoint', () => {
    const state = buildState({ checkpoint: 'pursue_or_pass' })
    const next = applyStepComplete(state, 'not_pursuing')
    expect(next.currentStep).toBe('not_pursuing')
    expect(next.checkpoint).toBeNull()
  })
})

// ─── buildTargetedViewState ───────────────────────────────────────────────────

describe('buildTargetedViewState', () => {
  const targeting = {
    role: 'SWE',
    scope: ['r0'],
    rewrites: [
      { bullet_id: 'r0-b0', original: 'a', rewritten: 'b', objective: 'x', structure: 'CAR', unquantified: false },
      { bullet_id: 'r0-b1', original: 'c', rewritten: 'd', objective: 'x', structure: 'CAR', unquantified: false },
    ],
    flagged_for_removal: [{ bullet_id: 'r0-b2', original: 'e', reason: 'weak' }],
    credibility_check: { throughline: 'strong', notes: '' },
  }
  const summaryRewrite = { original: 'Old', rewritten: 'New' }
  const resume = {
    name: 'Test',
    experience: [{
      id: 'r0', company: 'Acme', title: 'SWE',
      bullets: [{ id: 'r0-b0', text: 'a' }, { id: 'r0-b1', text: 'c' }, { id: 'r0-b2', text: 'e' }],
    }],
    education: [],
  }

  it('merges summaryRewrite into targetingData.summary_rewrite', () => {
    const vs = buildTargetedViewState(targeting, summaryRewrite, resume)
    expect(vs.targetingData?.summary_rewrite).toEqual(summaryRewrite)
  })

  it('sets summary_rewrite to undefined when summaryRewrite is null', () => {
    const vs = buildTargetedViewState(targeting, null, resume)
    expect(vs.targetingData?.summary_rewrite).toBeUndefined()
  })

  it('sets targetingData to null when targeting is null', () => {
    const vs = buildTargetedViewState(null, null, resume)
    expect(vs.targetingData).toBeNull()
  })

  it('always sets showDiffView to true', () => {
    expect(buildTargetedViewState(null, null, null).showDiffView).toBe(true)
  })
})

// ─── computeUnreviewedCount ───────────────────────────────────────────────────

describe('computeUnreviewedCount', () => {
  const resume = {
    name: 'Test',
    experience: [{
      id: 'r0', company: 'Acme', title: 'SWE',
      bullets: [{ id: 'r0-b0', text: 'a' }, { id: 'r0-b1', text: 'c' }, { id: 'r0-b2', text: 'e' }],
    }],
    education: [],
  }
  const targeting = {
    role: 'SWE',
    scope: ['r0'],
    rewrites: [
      { bullet_id: 'r0-b0', original: 'a', rewritten: 'b', objective: 'x', structure: 'CAR', unquantified: false },
      { bullet_id: 'r0-b1', original: 'c', rewritten: 'd', objective: 'x', structure: 'CAR', unquantified: false },
    ],
    flagged_for_removal: [{ bullet_id: 'r0-b2', original: 'e', reason: 'weak' }],
    credibility_check: { throughline: 'strong', notes: '' },
  }
  const summaryRewrite = { original: 'Old', rewritten: 'New' }
  const targetingWithSummary = { ...targeting, summary_rewrite: summaryRewrite }

  it('counts all unreviewed bullets + summary', () => {
    expect(computeUnreviewedCount(targetingWithSummary, resume, {}, undefined)).toBe(4)
  })

  it('counts only bullets when summary is absent', () => {
    expect(computeUnreviewedCount(targeting, resume, {}, undefined)).toBe(3)
  })

  it('decrements as bullets are reviewed', () => {
    expect(computeUnreviewedCount(targeting, resume, { 'r0-b0': true }, undefined)).toBe(2)
    expect(computeUnreviewedCount(targeting, resume, { 'r0-b0': true, 'r0-b1': false }, undefined)).toBe(1)
    expect(computeUnreviewedCount(targeting, resume, { 'r0-b0': true, 'r0-b1': false, 'r0-b2': true }, undefined)).toBe(0)
  })

  it('counts summary as unreviewed when summaryReview is undefined', () => {
    expect(computeUnreviewedCount(targetingWithSummary, resume, { 'r0-b0': true, 'r0-b1': true, 'r0-b2': true }, undefined)).toBe(1)
  })

  it('does not count summary when summaryReview is set', () => {
    expect(computeUnreviewedCount(targetingWithSummary, resume, { 'r0-b0': true, 'r0-b1': true, 'r0-b2': true }, true)).toBe(0)
  })

  it('counts a bullet in both rewrites and flagged_for_removal only once', () => {
    const t = { ...targeting, flagged_for_removal: [{ bullet_id: 'r0-b0', original: 'a', reason: 'weak' }] }
    // r0-b0 in rewrites AND removals → 2 unique bullets (r0-b0, r0-b1), no removal-only bullets
    expect(computeUnreviewedCount(t, resume, {}, undefined)).toBe(2)
  })

  it('does not count rewrites with hallucinated bullet_ids', () => {
    const t = { ...targeting, rewrites: [...targeting.rewrites, { bullet_id: 'r0-b99', original: 'x', rewritten: 'y', objective: 'z', structure: 'CAR', unquantified: false }] }
    expect(computeUnreviewedCount(t, resume, {}, undefined)).toBe(3) // r0-b99 not in resume
  })

  it('does not count bullets for out-of-scope roles', () => {
    const t = { ...targeting, flagged_for_removal: [{ bullet_id: 'r1-b0', original: 'x', reason: 'weak' }] }
    expect(computeUnreviewedCount(t, resume, {}, undefined)).toBe(2) // r1 not in scope
  })

  it('returns 0 when targetingData is null', () => {
    expect(computeUnreviewedCount(null, resume, {}, undefined)).toBe(0)
  })
})

// ─── targeted ─────────────────────────────────────────────────────────────────

describe('targeted', () => {
  const targetingData = {
    targeting: {
      role: 'Software Engineer',
      scope: ['r0'],
      rewrites: [
        { bullet_id: 'r0-b0', original: 'old', rewritten: 'new', objective: 'impact', structure: 'CAR', unquantified: false },
        { bullet_id: 'r0-b1', original: 'old2', rewritten: 'new2', objective: 'impact', structure: 'CAR', unquantified: true },
      ],
      flagged_for_removal: [],
      credibility_check: { throughline: 'strong', notes: '' },
    },
    resume: {
      name: 'Test User',
      experience: [{
        id: 'r0', company: 'Acme', title: 'SWE',
        bullets: [{ id: 'r0-b0', text: 'old' }, { id: 'r0-b1', text: 'old2' }],
      }],
      education: [],
    },
  }

  it('opens diff view and stores targeting + resume data', () => {
    const state = buildState()
    const next = applyStepComplete(state, 'targeted', targetingData)
    expect(next.showDiffView).toBe(true)
    expect(next.targetingData).toEqual(targetingData.targeting)
    expect(next.resumeData).toEqual(targetingData.resume)
  })

  it('resets summaryReview and summaryEdit to undefined', () => {
    const state = buildState({ summaryReview: true, summaryEdit: 'old edit' })
    const next = applyStepComplete(state, 'targeted', targetingData)
    expect(next.summaryReview).toBeUndefined()
    expect(next.summaryEdit).toBeUndefined()
  })

  it('clears checkpoint', () => {
    const state = buildState({ checkpoint: 'pursue_or_pass' })
    const next = applyStepComplete(state, 'targeted', targetingData)
    expect(next.checkpoint).toBeNull()
  })

  it('handles missing data gracefully', () => {
    const state = buildState()
    const next = applyStepComplete(state, 'targeted', undefined)
    expect(next.showDiffView).toBe(true)
    expect(next.targetingData).toBeNull()
    expect(next.resumeData).toBeNull()
  })
})

// ─── exported ─────────────────────────────────────────────────────────────────

describe('exported', () => {
  it('sets currentStep and closes diff view', () => {
    const state = buildState({ showDiffView: true })
    const next = applyStepComplete(state, 'exported')
    expect(next.currentStep).toBe('exported')
    expect(next.showDiffView).toBe(false)
  })
})

// ─── applyDone ────────────────────────────────────────────────────────────────

describe('applyDone', () => {
  it('sets isStreaming to false', () => {
    const state = buildState({ isStreaming: true })
    const next = applyDone(state)
    expect(next.isStreaming).toBe(false)
  })

  it('sets arc_confirmation checkpoint when currentStep is resume_loaded and no error', () => {
    const state = buildState({ currentStep: 'resume_loaded', isStreaming: true, error: null })
    const next = applyDone(state)
    expect(next.checkpoint).toBe('arc_confirmation')
  })

  it('does not set arc_confirmation when currentStep is resume_loaded but there is an error', () => {
    const state = buildState({ currentStep: 'resume_loaded', isStreaming: true, error: { code: 'API_ERROR', message: 'Failed' } })
    const next = applyDone(state)
    expect(next.checkpoint).toBeNull()
  })

  it('sets scope_selection checkpoint when currentStep is assessed and last assistant message is scope proposal', () => {
    const state = buildState({
      currentStep: 'assessed',
      isStreaming: true,
      error: null,
      messages: [buildMessage({ role: 'assistant', type: 'text', content: "I'll rewrite Senior PM at Acme. Want to include any other roles, or does this scope work?" })],
    })
    const next = applyDone(state)
    expect(next.checkpoint).toBe('scope_selection')
  })

  it('does not set scope_selection when currentStep is assessed but last assistant message is not scope proposal', () => {
    const state = buildState({
      currentStep: 'assessed',
      isStreaming: true,
      error: null,
      messages: [buildMessage({ role: 'assistant', type: 'text', content: 'Before I rewrite, can you share some numbers?' })],
    })
    const next = applyDone(state)
    expect(next.checkpoint).toBeNull()
  })

  it('does not set scope_selection when currentStep is assessed but there is an error', () => {
    const state = buildState({
      currentStep: 'assessed',
      isStreaming: true,
      error: { code: 'API_ERROR', message: 'Failed' },
      messages: [buildMessage({ role: 'assistant', type: 'text', content: "I'll rewrite Senior PM at Acme." })],
    })
    const next = applyDone(state)
    expect(next.checkpoint).toBeNull()
  })

  it('preserves existing checkpoint when currentStep is not resume_loaded or assessed', () => {
    const state = buildState({ currentStep: 'decoded', checkpoint: 'pursue_or_pass', isStreaming: true })
    const next = applyDone(state)
    expect(next.checkpoint).toBe('pursue_or_pass')
  })

  it('does not mutate the original state', () => {
    const state = buildState({ currentStep: 'resume_loaded', isStreaming: true })
    applyDone(state)
    expect(state.isStreaming).toBe(true)
    expect(state.checkpoint).toBeNull()
  })
})

// ─── default / unknown step ───────────────────────────────────────────────────

describe('default (unknown step)', () => {
  it('sets currentStep without other changes', () => {
    const state = buildState({ showDiffView: true, checkpoint: 'arc_confirmation' })
    const next = applyStepComplete(state, 'abandoned' as CurrentStep)
    expect(next.currentStep).toBe('abandoned')
    expect(next.showDiffView).toBe(true)
    expect(next.checkpoint).toBe('arc_confirmation')
  })
})

// ─── parseVerdictFromText ─────────────────────────────────────────────────────

describe('parseVerdictFromText', () => {
  const fullBlock = [
    '## Verdict',
    'verdict: no-brainer',
    'hard_req_status: all met',
    'arc_alignment: strong',
    'key_factors: factor one; factor two',
    '',
    '---',
    '',
    '# Fit Assessment: Engineer @ Acme',
    '## Hard Requirements',
    '- Backend depth: Met — 5 years Node',
  ].join('\n')

  it('returns null when content has no verdict field', () => {
    expect(parseVerdictFromText('some regular assistant text')).toBeNull()
  })

  it('returns null when verdict value is not one of the three valid verdicts', () => {
    expect(parseVerdictFromText('verdict: pretty good\narc_alignment: strong')).toBeNull()
  })

  it('parses a complete verdict block with all fields', () => {
    const result = parseVerdictFromText(fullBlock)
    expect(result).not.toBeNull()
    expect(result?.verdict).toBe('no-brainer')
    expect(result?.arc_alignment).toBe('strong')
    expect(result?.hard_req_status).toBe('all met')
    expect(result?.key_factors).toBe('factor one; factor two')
  })

  it('handles stretch but doable verdict', () => {
    const content = 'verdict: stretch but doable\narc_alignment: partial\nkey_factors: needs narrative work'
    const result = parseVerdictFromText(content)
    expect(result?.verdict).toBe('stretch but doable')
    expect(result?.arc_alignment).toBe('partial')
  })

  it('handles not a fit verdict', () => {
    const content = 'verdict: not a fit\narc_alignment: weak\nkey_factors: missing core skills\nhard_req_status: not met: salesforce'
    const result = parseVerdictFromText(content)
    expect(result?.verdict).toBe('not a fit')
    expect(result?.arc_alignment).toBe('weak')
  })

  it('returns a result from mid-stream content that only has the verdict block so far', () => {
    const partial = '## Verdict\nverdict: no-brainer\nhard_req_status: all met\narc_alignment: strong\nkey_factors: deep domain fit'
    const result = parseVerdictFromText(partial)
    expect(result?.verdict).toBe('no-brainer')
    expect(result?.key_factors).toBe('deep domain fit')
  })

  it('returns empty strings for missing optional fields rather than crashing', () => {
    const minimal = 'verdict: not a fit'
    const result = parseVerdictFromText(minimal)
    expect(result?.verdict).toBe('not a fit')
    expect(result?.arc_alignment).toBe('')
    expect(result?.key_factors).toBe('')
    expect(result?.hard_req_status).toBe('')
  })
})
