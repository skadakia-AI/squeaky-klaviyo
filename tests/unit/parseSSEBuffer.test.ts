import { describe, it, expect } from 'vitest'
import { parseSSEBuffer } from '../../app/lib/sse'

describe('parseSSEBuffer', () => {

  // ─── Basic parsing ──────────────────────────────────────────────────────────

  it('parses a single complete event', () => {
    const raw = 'data: {"type":"done"}\n\n'
    const { events, remaining } = parseSSEBuffer(raw)
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ type: 'done' })
    expect(remaining).toBe('')
  })

  it('parses multiple complete events in one chunk', () => {
    const raw = [
      'data: {"type":"token","content":"Hello"}\n\n',
      'data: {"type":"token","content":" world"}\n\n',
      'data: {"type":"done"}\n\n',
    ].join('')
    const { events } = parseSSEBuffer(raw)
    expect(events).toHaveLength(3)
    expect(events[0]).toEqual({ type: 'token', content: 'Hello' })
    expect(events[1]).toEqual({ type: 'token', content: ' world' })
    expect(events[2]).toEqual({ type: 'done' })
  })

  // ─── Partial / split events ─────────────────────────────────────────────────

  it('returns incomplete trailing data as remaining', () => {
    const raw = 'data: {"type":"done"}\n\ndata: {"type":"token"'
    const { events, remaining } = parseSSEBuffer(raw)
    expect(events).toHaveLength(1)
    expect(remaining).toBe('data: {"type":"token"')
  })

  it('handles an event split across two chunks', () => {
    const chunk1 = 'data: {"type":"token","cont'
    const chunk2 = 'ent":"hi"}\n\n'

    const { events: e1, remaining: r1 } = parseSSEBuffer(chunk1)
    expect(e1).toHaveLength(0)
    expect(r1).toBe(chunk1)

    const { events: e2, remaining: r2 } = parseSSEBuffer(r1 + chunk2)
    expect(e2).toHaveLength(1)
    expect(e2[0]).toEqual({ type: 'token', content: 'hi' })
    expect(r2).toBe('')
  })

  // ─── Resilience ─────────────────────────────────────────────────────────────

  it('skips malformed JSON without throwing', () => {
    const raw = 'data: {broken json}\n\ndata: {"type":"done"}\n\n'
    const { events } = parseSSEBuffer(raw)
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ type: 'done' })
  })

  it('skips lines not starting with "data: "', () => {
    const raw = ': keep-alive\n\ndata: {"type":"done"}\n\n'
    const { events } = parseSSEBuffer(raw)
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ type: 'done' })
  })

  it('returns empty events and empty remaining for an empty string', () => {
    const { events, remaining } = parseSSEBuffer('')
    expect(events).toHaveLength(0)
    expect(remaining).toBe('')
  })

  // ─── All event types ────────────────────────────────────────────────────────

  it('parses a session_created event', () => {
    const raw = 'data: {"type":"session_created","session_id":"abc-123"}\n\n'
    const { events } = parseSSEBuffer(raw)
    expect(events[0]).toEqual({ type: 'session_created', session_id: 'abc-123' })
  })

  it('parses a message event', () => {
    const raw = 'data: {"type":"message","role":"assistant","content":"Upload your resume."}\n\n'
    const { events } = parseSSEBuffer(raw)
    expect(events[0]).toEqual({ type: 'message', role: 'assistant', content: 'Upload your resume.' })
  })

  it('parses a step_complete event with data', () => {
    const payload = {
      type: 'step_complete',
      step: 'assessed',
      data: { verdict: 'no-brainer', arc_alignment: 'strong' },
    }
    const raw = `data: ${JSON.stringify(payload)}\n\n`
    const { events } = parseSSEBuffer(raw)
    expect(events[0]).toEqual(payload)
  })

  it('parses an error event', () => {
    const raw = 'data: {"type":"error","code":"RATE_LIMITED","message":"Try again."}\n\n'
    const { events } = parseSSEBuffer(raw)
    expect(events[0]).toEqual({ type: 'error', code: 'RATE_LIMITED', message: 'Try again.' })
  })
})
