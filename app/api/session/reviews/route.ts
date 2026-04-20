import { auth } from '@clerk/nextjs/server'
import { getServiceClient } from '../../../lib/supabase'
import { getSession, patchSession } from '../../../lib/utils/db'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { session_id, bullet_reviews, bullet_edits, bullets_accepted, excluded_out_of_scope_roles, summary_accepted, summary_edit } = body

  if (!session_id) return Response.json({ error: 'session_id required' }, { status: 400 })

  const supabase = getServiceClient()

  const session = await getSession(supabase, session_id, userId)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 403 })

  const ok = await patchSession(supabase, session_id, userId, {
    bullet_reviews: bullet_reviews ?? {},
    bullet_edits: bullet_edits ?? {},
    bullets_accepted: bullets_accepted ?? 0,
    excluded_out_of_scope_roles: excluded_out_of_scope_roles ?? [],
    summary_accepted: summary_accepted ?? null,
    summary_edit: summary_edit ?? null,
    updated_at: new Date().toISOString(),
  })

  if (!ok) {
    return Response.json({ error: 'Failed to save reviews' }, { status: 500 })
  }

  return Response.json({ success: true })
}
