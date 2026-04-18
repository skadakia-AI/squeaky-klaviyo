import { auth } from '@clerk/nextjs/server'
import { getServiceClient } from '../../lib/supabase'
import { listSessions } from '../../lib/utils/db'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServiceClient()
  const sessions = await listSessions(supabase, userId)

  return Response.json({ sessions })
}
