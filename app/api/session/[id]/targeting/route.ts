import { auth } from '@clerk/nextjs/server'
import { getServiceClient } from '../../../../lib/supabase'
import { getSession } from '../../../../lib/utils/db'
import type { Resume, TargetingOutput } from '../../../../lib/types'

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

  const basePath = `users/${userId}/${id}`

  const [resumeRes, targetingRes, summaryRes] = await Promise.all([
    supabase.storage.from('squeaky').download(`${basePath}/resume_structured.json`),
    supabase.storage.from('squeaky').download(`${basePath}/targeted_resume.json`),
    supabase.storage.from('squeaky').download(`${basePath}/summary_rewrite.json`),
  ])

  if (resumeRes.error || !resumeRes.data) {
    return Response.json({ error: 'Resume not found' }, { status: 404 })
  }

  const resume: Resume = JSON.parse(await resumeRes.data.text())
  const targeting: TargetingOutput | null = targetingRes.error || !targetingRes.data
    ? null
    : JSON.parse(await targetingRes.data.text())

  const summaryRewrite = summaryRes.data && !summaryRes.error
    ? JSON.parse(await summaryRes.data.text())
    : null

  return Response.json({ resume, targeting, summaryRewrite })
}
