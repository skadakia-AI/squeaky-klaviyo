import { getServiceClient } from '../supabase'
import type { Resume, TargetingOutput } from '../types'

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
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('bullet_reviews, bullet_edits, user_id')
    .eq('id', input.sessionId)
    .single()

  if (sessionError || !session) return { success: false, error: 'SESSION_NOT_FOUND', message: 'Session not found. Try starting a new session.' }
  if (session.user_id !== input.userId) return { success: false, error: 'UNAUTHORIZED', message: 'You don\'t have access to this session.' }

  const bulletReviews: Record<string, boolean> = session.bullet_reviews ?? {}
  const bulletEdits: Record<string, string> = session.bullet_edits ?? {}

  // ── 2. Fetch source files ────────────────────────────────────────────────
  const basePath = `users/${input.userId}/${input.sessionId}`

  const [resumeRes, targetingRes] = await Promise.all([
    supabase.storage.from('squeaky').download(`${basePath}/resume_structured.json`),
    supabase.storage.from('squeaky').download(`${basePath}/targeted_resume.json`),
  ])

  if (resumeRes.error || !resumeRes.data) return { success: false, error: 'RESUME_NOT_FOUND', message: 'Resume data not found for this session. Try re-uploading your resume.' }
  if (targetingRes.error || !targetingRes.data) return { success: false, error: 'TARGETING_NOT_FOUND', message: 'Targeting output not found. The resume targeting step may not have completed.' }

  const resume: Resume = JSON.parse(await resumeRes.data.text())
  const targeting: TargetingOutput = JSON.parse(await targetingRes.data.text())

  // ── 3. Bullet resolution ─────────────────────────────────────────────────
  const removedBulletIds = new Set(
    targeting.flagged_for_removal
      .filter(r => bulletReviews[r.bullet_id] === true)
      .map(r => r.bullet_id)
  )

  const rewriteMap = new Map(targeting.rewrites.map(r => [r.bullet_id, r.rewritten]))

  function resolveText(bulletId: string, originalText: string): string {
    if (bulletEdits[bulletId]) return bulletEdits[bulletId]
    if (rewriteMap.has(bulletId) && bulletReviews[bulletId] === true) return rewriteMap.get(bulletId)!
    return originalText
  }

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

    if (resume.summary) {
      children.push(new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: resume.summary, italics: true, size: 22, font: FONT })],
      }))
    }

    // Experience
    const experienceRoles = resume.experience.map(role => {
      const remainingBullets = role.bullets.filter(b => !removedBulletIds.has(b.id))
      return { role, remainingBullets }
    }).filter(({ remainingBullets }) => remainingBullets.length > 0)

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
            children: [new TextRun({ text: resolveText(bullet.id, bullet.text), size: 22, font: FONT })],
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

  const { data: urlData, error: urlError } = await supabase.storage
    .from('squeaky')
    .createSignedUrl(storagePath, 3600)

  if (urlError || !urlData) {
    return { success: false, error: 'UPLOAD_FAILED', message: 'File saved but couldn\'t generate download link. Try again.' }
  }

  return { success: true, downloadUrl: urlData.signedUrl, storagePath }
}
