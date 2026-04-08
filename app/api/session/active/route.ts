import { auth } from '@clerk/nextjs/server'
import { getServiceClient } from '../../../lib/supabase'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServiceClient()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Find most recent in-progress session
  const { data: session } = await supabase
    .from('sessions')
    .select('id, role, company, current_step, created_at, updated_at')
    .eq('user_id', userId)
    .eq('status', 'in_progress')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (!session) return Response.json({ session: null })

  // Auto-abandon sessions older than 7 days
  if (session.updated_at < sevenDaysAgo) {
    await supabase
      .from('sessions')
      .update({ status: 'abandoned', updated_at: new Date().toISOString() })
      .eq('id', session.id)
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
