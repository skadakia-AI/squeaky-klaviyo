import { auth } from '@clerk/nextjs/server'
import { getServiceClient } from '../../../lib/supabase'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { session_id, bullet_reviews, bullet_edits, bullets_accepted } = body

  if (!session_id) return Response.json({ error: 'session_id required' }, { status: 400 })

  const supabase = getServiceClient()

  // Verify ownership
  const { data: session } = await supabase
    .from('sessions')
    .select('user_id')
    .eq('id', session_id)
    .single()

  if (!session || session.user_id !== userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { error } = await supabase
    .from('sessions')
    .update({
      bullet_reviews: bullet_reviews ?? {},
      bullet_edits: bullet_edits ?? {},
      bullets_accepted: bullets_accepted ?? 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', session_id)

  if (error) {
    console.error('[reviews] update error:', error.message)
    return Response.json({ error: 'Failed to save reviews' }, { status: 500 })
  }

  return Response.json({ success: true })
}
