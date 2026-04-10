import { auth } from '@clerk/nextjs/server'
import { getServiceClient } from '../../lib/supabase'
import { runOrchestrator } from '../../lib/orchestrator'
import type { OrchestratorEvent } from '../../lib/orchestrator'

export const maxDuration = 300

const encoder = new TextEncoder()

function makeStream(
  handler: (emit: (event: OrchestratorEvent) => void) => Promise<void>
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function emit(event: OrchestratorEvent) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      try {
        await handler(emit)
      } catch (err) {
        console.error('[route] unhandled error:', err)
        emit({ type: 'error', code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' })
      } finally {
        emit({ type: 'done' })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { session_id, message } = body as {
    session_id: string | null
    message: { type: 'text' | 'file_upload'; content: string; file_name?: string; file_type?: string }
  }

  const supabase = getServiceClient()

  return makeStream(async (emit) => {
    let sessionId = session_id
    let session: Record<string, unknown>

    if (!sessionId) {
      const { data: newSession, error } = await supabase
        .from('sessions')
        .insert({ user_id: userId, current_step: 'created', status: 'in_progress' })
        .select('id')
        .single()

      if (error || !newSession) {
        emit({ type: 'error', code: 'SESSION_ERROR', message: 'Could not start a new session. Please try again.' })
        return
      }

      sessionId = newSession.id
      emit({ type: 'session_created', session_id: sessionId! })
      session = { current_step: 'created', user_id: userId }
    } else {
      const { data: existing, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .single()

      if (error || !existing) {
        emit({ type: 'error', code: 'SESSION_NOT_FOUND', message: 'Session not found. Try starting a new session.' })
        return
      }

      session = existing
    }

    await runOrchestrator(sessionId!, userId, message, session, emit)
  })
}
