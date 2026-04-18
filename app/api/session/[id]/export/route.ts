import { auth } from '@clerk/nextjs/server'
import { exportResume } from '../../../../lib/utils/export-resume'

export const maxDuration = 60

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const result = await exportResume({ sessionId: id, userId })

  if (!result.success) {
    return Response.json({ error: result.error, message: result.message }, { status: 500 })
  }

  return Response.json({ downloadUrl: result.downloadUrl })
}
