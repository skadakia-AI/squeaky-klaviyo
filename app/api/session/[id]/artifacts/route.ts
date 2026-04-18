import { auth } from '@clerk/nextjs/server'
import { getServiceClient } from '../../../../lib/supabase'
import { getSession } from '../../../../lib/utils/db'
import { resolveText } from '../../../../lib/utils/export-resume'
import type { Resume, TargetingOutput } from '../../../../lib/types'

const STORAGE_FILES = {
  jd:  'decoded_jd.md',
  fit: 'fit_assessment.md',
} as const

type ArtifactType = 'jd' | 'fit' | 'resume'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const type = new URL(request.url).searchParams.get('type') as ArtifactType | null

  if (!type || !['jd', 'fit', 'resume'].includes(type)) {
    return Response.json({ error: 'type must be jd, fit, or resume' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const session = await getSession(supabase, id, userId)
  if (!session) return Response.json({ error: 'Not found' }, { status: 404 })

  if (type === 'resume') {
    const content = await buildResumeMarkdown(supabase, userId, id, session)
    if (!content) return Response.json({ error: 'NOT_FOUND' }, { status: 404 })
    return Response.json({ content })
  }

  const path = `users/${userId}/${id}/${STORAGE_FILES[type]}`
  const { data, error } = await supabase.storage.from('squeaky').download(path)
  if (error || !data) return Response.json({ error: 'NOT_FOUND' }, { status: 404 })

  return Response.json({ content: await data.text() })
}

async function buildResumeMarkdown(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  sessionId: string,
  session: Record<string, unknown>
): Promise<string | null> {
  const basePath = `users/${userId}/${sessionId}`

  const [resumeRes, targetingRes] = await Promise.all([
    supabase.storage.from('squeaky').download(`${basePath}/resume_structured.json`),
    supabase.storage.from('squeaky').download(`${basePath}/targeted_resume.json`),
  ])

  if (resumeRes.error || !resumeRes.data) return null

  const resume: Resume = JSON.parse(await resumeRes.data.text())
  const targeting: TargetingOutput | null = targetingRes.error || !targetingRes.data
    ? null
    : JSON.parse(await targetingRes.data.text())

  const bulletReviews: Record<string, boolean> = (session.bullet_reviews as Record<string, boolean>) ?? {}
  const bulletEdits: Record<string, string> = (session.bullet_edits as Record<string, string>) ?? {}
  const excludedRoles: string[] = (session.excluded_out_of_scope_roles as string[]) ?? []

  const removedBulletIds = new Set(
    targeting?.flagged_for_removal
      .filter(r => bulletReviews[r.bullet_id] === true)
      .map(r => r.bullet_id) ?? []
  )
  const rewriteMap = new Map(targeting?.rewrites.map(r => [r.bullet_id, r.rewritten]) ?? [])
  const scopeSet = new Set(targeting?.scope ?? [])

  const lines: string[] = []

  lines.push(`# ${resume.name}`)
  const contact = [resume.email, resume.phone, resume.location, resume.linkedin, resume.website].filter(Boolean)
  if (contact.length) lines.push(contact.join(' · '))
  lines.push('')

  if (resume.summary) {
    lines.push('## Summary')
    lines.push(resume.summary)
    lines.push('')
  }

  if (resume.experience?.length) {
    lines.push('## Experience')
    for (const role of resume.experience) {
      const bulletsExcluded = !scopeSet.has(role.id) && excludedRoles.includes(role.id)
      const dates = [role.start_date, role.end_date].filter(Boolean).join(' – ')
      lines.push('')
      lines.push(`### ${role.company} — ${role.title}${dates ? `  ·  ${dates}` : ''}`)
      if (role.description) lines.push(`*${role.description}*`)
      if (!bulletsExcluded) {
        for (const bullet of role.bullets) {
          if (removedBulletIds.has(bullet.id)) continue
          lines.push(`- ${resolveText(bullet.id, bullet.text, bulletReviews, bulletEdits, rewriteMap)}`)
        }
      }
    }
    lines.push('')
  }

  if (resume.education?.length) {
    lines.push('## Education')
    for (const edu of resume.education) {
      const degree = [edu.degree, edu.field].filter(Boolean).join(', ')
      lines.push('')
      lines.push(`### ${edu.institution}${degree ? ` — ${degree}` : ''}${edu.dates ? `  ·  ${edu.dates}` : ''}`)
      if (edu.notes?.length) {
        for (const note of edu.notes) lines.push(`- ${note}`)
      }
    }
    lines.push('')
  }

  if (resume.skills?.length) {
    lines.push('## Skills')
    lines.push(resume.skills.join(', '))
    lines.push('')
  }

  if (resume.other?.length) {
    for (const section of resume.other) {
      lines.push(`## ${section.title}`)
      lines.push(section.content)
      lines.push('')
    }
  }

  return lines.join('\n')
}
