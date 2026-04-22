import { getServiceClient } from '../supabase'
import { getSession } from './db'
import type { Resume, SummaryRewrite, TargetingOutput } from '../types'

// Priority: explicit rejection → edited text → accepted rewrite → original
export function resolveSummary(
  originalText: string | undefined,
  summaryAccepted: boolean | null,
  summaryEdit: string | null,
  rewritten: string | null | undefined,
): string | undefined {
  if (summaryAccepted === false) return originalText
  if (summaryEdit) return summaryEdit
  if (rewritten && summaryAccepted === true) return rewritten
  return originalText
}

export function resolveText(
  bulletId: string,
  originalText: string,
  bulletReviews: Record<string, boolean>,
  bulletEdits: Record<string, string>,
  rewriteMap: Map<string, string>
): string {
  if (bulletReviews[bulletId] === false) return originalText
  if (bulletEdits[bulletId]) return bulletEdits[bulletId]
  if (rewriteMap.has(bulletId) && bulletReviews[bulletId] === true) return rewriteMap.get(bulletId)!
  return originalText
}

// Builds a human-readable download filename from resume owner name + session metadata.
// Each segment is slugified (non-alphanumeric → hyphen, collapsed). Parts are capped
// so the total stays well under OS filename limits.
export function buildExportFilename(
  resumeName: string,
  company: string | null | undefined,
  role: string | null | undefined,
): string {
  const slugify = (s: string, maxLen: number) =>
    s.replace(/[^a-zA-Z0-9\s]/g, ' ').trim().replace(/\s+/g, '-').slice(0, maxLen)

  const initials = resumeName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .map(w => w[0].toUpperCase())
    .join('')

  const parts = [
    initials || null,
    company ? slugify(company, 30) : null,
    role ? slugify(role, 35) : null,
  ].filter(Boolean)

  return initials && parts.length >= 2 ? `${parts.join('_')}.docx` : 'resume.docx'
}

type ExportResumeInput = {
  sessionId: string
  userId: string
}

type ExportResumeResult =
  | { success: true; downloadUrl: string; storagePath: string }
  | { success: false; error: string; message: string }

export async function exportResume(input: ExportResumeInput): Promise<ExportResumeResult> {
  const supabase = getServiceClient()

  // ── 1. Fetch session ─────────────────────────────────────────────────────
  const session = await getSession(supabase, input.sessionId, input.userId)
  if (!session) return { success: false, error: 'SESSION_NOT_FOUND', message: 'Session not found. Try starting a new session.' }

  const bulletReviews: Record<string, boolean> = session.bullet_reviews ?? {}
  const bulletEdits: Record<string, string> = session.bullet_edits ?? {}
  const excludedOutOfScopeRoles: string[] = session.excluded_out_of_scope_roles ?? []
  const summaryAccepted: boolean | null = session.summary_accepted ?? null
  const summaryEdit: string | null = session.summary_edit ?? null

  // ── 2. Fetch source files ────────────────────────────────────────────────
  const basePath = `users/${input.userId}/${input.sessionId}`

  const [resumeRes, targetingRes, summaryRes] = await Promise.all([
    supabase.storage.from('squeaky').download(`${basePath}/resume_structured.json`),
    supabase.storage.from('squeaky').download(`${basePath}/targeted_resume.json`),
    supabase.storage.from('squeaky').download(`${basePath}/summary_rewrite.json`),
  ])

  if (resumeRes.error || !resumeRes.data) return { success: false, error: 'RESUME_NOT_FOUND', message: 'Resume data not found for this session. Try re-uploading your resume.' }
  if (targetingRes.error || !targetingRes.data) return { success: false, error: 'TARGETING_NOT_FOUND', message: 'Targeting output not found. The resume targeting step may not have completed.' }

  const resume: Resume = JSON.parse(await resumeRes.data.text())
  const targeting: TargetingOutput = JSON.parse(await targetingRes.data.text())
  const summaryRewrite: SummaryRewrite | null = summaryRes.data && !summaryRes.error
    ? JSON.parse(await summaryRes.data.text())
    : null

  // ── 3. Bullet resolution ─────────────────────────────────────────────────
  const removedBulletIds = new Set(
    targeting.flagged_for_removal
      .filter(r => bulletReviews[r.bullet_id] === true)
      .map(r => r.bullet_id)
  )

  const rewriteMap = new Map(targeting.rewrites.map(r => [r.bullet_id, r.rewritten]))

  // ── 4. Generate docx ─────────────────────────────────────────────────────
  let docxBuffer: Buffer
  try {
    const { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle } = await import('docx')

    const FONT = 'Calibri'

    function sectionHeading(text: string) {
      return new Paragraph({
        spacing: { before: 120, after: 60 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '111827' } },
        children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 22, font: FONT })],
      })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children: any[] = []

    // Header
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: resume.name, bold: true, size: 32, font: FONT })],
    }))

    const contactParts = [resume.email, resume.phone, resume.location, resume.linkedin, resume.website].filter(Boolean)
    if (contactParts.length > 0) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [new TextRun({ text: contactParts.join(' · '), size: 20, font: FONT })],
      }))
    }

    const summaryText = resolveSummary(resume.summary, summaryAccepted, summaryEdit, summaryRewrite?.rewritten)
    if (summaryText) {
      children.push(new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: summaryText, italics: true, size: 22, font: FONT })],
      }))
    }

    // Experience
    const scopeSet = new Set(targeting.scope ?? [])
    const experienceRoles = resume.experience.map(role => {
      const bulletsExcluded = !scopeSet.has(role.id) && excludedOutOfScopeRoles.includes(role.id)
      const remainingBullets = bulletsExcluded
        ? []
        : role.bullets.filter(b => !removedBulletIds.has(b.id))
      return { role, remainingBullets }
    })

    if (experienceRoles.length > 0) {
      children.push(sectionHeading('Experience'))
      for (const { role, remainingBullets } of experienceRoles) {
        const dates = [role.start_date, role.end_date].filter(Boolean).join(' – ')
        children.push(new Paragraph({
          spacing: { before: 80 },
          children: [
            new TextRun({ text: role.company, bold: true, size: 22, font: FONT }),
            new TextRun({ text: `  ${role.title}`, size: 22, font: FONT }),
            ...(dates ? [new TextRun({ text: `  ${dates}`, size: 22, font: FONT, color: '6B7280' })] : []),
          ],
        }))
        if (role.location) {
          children.push(new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun({ text: role.location, size: 20, font: FONT, color: '6B7280' })],
          }))
        }
        if (role.description) {
          children.push(new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun({ text: role.description, size: 22, font: FONT })],
          }))
        }
        for (const bullet of remainingBullets) {
          children.push(new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 40 },
            children: [new TextRun({ text: resolveText(bullet.id, bullet.text, bulletReviews, bulletEdits, rewriteMap), size: 22, font: FONT })],
          }))
        }
      }
    }

    // Education
    if (resume.education.length > 0) {
      children.push(sectionHeading('Education'))
      for (const edu of resume.education) {
        children.push(new Paragraph({
          spacing: { before: 80 },
          children: [
            new TextRun({ text: edu.institution, bold: true, size: 22, font: FONT }),
            ...(edu.degree ? [new TextRun({ text: `  ${edu.degree}${edu.field ? `, ${edu.field}` : ''}`, size: 22, font: FONT })] : []),
            ...(edu.dates ? [new TextRun({ text: `  ${edu.dates}`, size: 22, font: FONT, color: '6B7280' })] : []),
          ],
        }))
        if (edu.notes) {
          for (const note of edu.notes) {
            children.push(new Paragraph({
              bullet: { level: 0 },
              spacing: { after: 40 },
              children: [new TextRun({ text: note, size: 20, font: FONT })],
            }))
          }
        }
      }
    }

    // Skills
    if (resume.skills && resume.skills.length > 0) {
      children.push(sectionHeading('Skills'))
      children.push(new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: resume.skills.join(', '), size: 22, font: FONT })],
      }))
    }

    // Other sections
    if (resume.other && resume.other.length > 0) {
      children.push(sectionHeading('Other'))
      for (const section of resume.other) {
        children.push(new Paragraph({
          spacing: { before: 80 },
          children: [new TextRun({ text: section.title, bold: true, size: 22, font: FONT })],
        }))
        children.push(new Paragraph({
          spacing: { after: 60 },
          children: [new TextRun({ text: section.content, size: 22, font: FONT })],
        }))
      }
    }

    const doc = new Document({
      sections: [{
        properties: {
          page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
        },
        children,
      }],
    })

    docxBuffer = Buffer.from(await Packer.toBuffer(doc))
  } catch (err) {
    console.error('[export-resume] docx generation error:', err)
    return { success: false, error: 'GENERATION_FAILED', message: 'Something went wrong while building the document. Try again.' }
  }

  // ── 5. Upload ────────────────────────────────────────────────────────────
  const storagePath = `${basePath}/export.docx`
  const { error: uploadError } = await supabase.storage
    .from('squeaky')
    .upload(storagePath, docxBuffer, { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', upsert: true })

  if (uploadError) {
    return { success: false, error: 'UPLOAD_FAILED', message: 'The file was generated but couldn\'t be saved. Try again.' }
  }

  // ── 6. Log and return signed URL ─────────────────────────────────────────
  await supabase.from('events').insert({
    session_id: input.sessionId,
    user_id: input.userId,
    event: 'docx_downloaded',
  })

  const filename = buildExportFilename(resume.name, session.company, session.role)

  const { data: urlData, error: urlError } = await supabase.storage
    .from('squeaky')
    .createSignedUrl(storagePath, 3600, { download: filename })

  if (urlError || !urlData) {
    return { success: false, error: 'UPLOAD_FAILED', message: 'File saved but couldn\'t generate download link. Try again.' }
  }

  return { success: true, downloadUrl: urlData.signedUrl, storagePath }
}
