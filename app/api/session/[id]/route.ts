import { auth } from '@clerk/nextjs/server'
import { getServiceClient } from '../../../lib/supabase'
import { getSession, archiveSession } from '../../../lib/utils/db'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = getServiceClient()

  const session = await getSession(supabase, id, userId)
  if (!session) return Response.json({ error: 'Not found' }, { status: 404 })

  const { data: messages } = await supabase
    .from('messages')
    .select('id, role, content, step, created_at')
    .eq('session_id', id)
    .order('created_at', { ascending: true })

  return Response.json({ session, messages: messages ?? [] })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = getServiceClient()

  const session = await getSession(supabase, id, userId)
  if (!session) return Response.json({ error: 'Not found' }, { status: 404 })

  const ok = await archiveSession(supabase, id, userId)
  if (!ok) return Response.json({ error: 'Failed to remove session' }, { status: 500 })

  return Response.json({ success: true })
}
