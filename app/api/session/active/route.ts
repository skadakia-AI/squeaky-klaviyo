import { auth } from '@clerk/nextjs/server'
import { getServiceClient } from '../../../lib/supabase'
import { getActiveSession, patchSession } from '../../../lib/utils/db'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServiceClient()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const session = await getActiveSession(supabase, userId)

  if (!session) return Response.json({ session: null })

  // Auto-abandon sessions older than 7 days
  if (session.updated_at < sevenDaysAgo) {
    await patchSession(supabase, session.id, userId, { status: 'abandoned', updated_at: new Date().toISOString() })
    return Response.json({ session: null })
  }

  // Fetch message history for recovery
  const { data: messages } = await supabase
    .from('messages')
    .select('role, content, step, created_at')
    .eq('session_id', session.id)
    .order('created_at', { ascending: true })

  return Response.json({ session, messages: messages ?? [] })
}
