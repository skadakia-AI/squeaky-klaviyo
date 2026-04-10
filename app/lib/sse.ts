import type { OutboundMessage, SSEEvent } from './types'

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

        // SSE wire format: each event is "data: {...}\n\n"
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6)) as SSEEvent
            onEvent(event)
          } catch {
            console.error('[sse] failed to parse event:', line)
          }
        }
      }
    })
    .catch((err: unknown) => {
      if ((err as { name?: string }).name === 'AbortError') return
      onEvent({ type: 'error', code: 'STREAM_ERROR', message: 'Connection lost. Please try again.' })
    })

  return () => controller.abort()
}
