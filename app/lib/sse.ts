import type { OutboundMessage, SSEEvent } from './types'

// Parses a raw SSE buffer string into complete events and a leftover remainder.
// The remainder is whatever arrived after the last \n\n delimiter — it belongs
// to the next chunk. Malformed events are skipped silently.
export function parseSSEBuffer(raw: string): { events: SSEEvent[]; remaining: string } {
  const parts = raw.split('\n\n')
  const remaining = parts.pop() ?? ''
  const events: SSEEvent[] = []
  for (const part of parts) {
    const line = part.trim()
    if (!line.startsWith('data: ')) continue
    try {
      events.push(JSON.parse(line.slice(6)) as SSEEvent)
    } catch {
      // malformed event — skip
    }
  }
  return { events, remaining }
}

// EventSource only supports GET — we use fetch + ReadableStream for POST SSE.
export function openStream(
  message: OutboundMessage,
  sessionId: string | null,
  onEvent: (event: SSEEvent) => void
): () => void {
  const controller = new AbortController()

  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, message }),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        onEvent({ type: 'error', code: 'FETCH_FAILED', message: 'Connection failed. Please try again.' })
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        const { events, remaining } = parseSSEBuffer(buffer)
        buffer = remaining
        for (const event of events) {
          onEvent(event)
        }
      }
    })
    .catch((err: unknown) => {
      if ((err as { name?: string }).name === 'AbortError') return
      onEvent({ type: 'error', code: 'STREAM_ERROR', message: 'Connection lost. Please try again.' })
    })

  return () => controller.abort()
}
