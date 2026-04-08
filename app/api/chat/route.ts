import fs from 'fs'
import path from 'path'
import { auth } from '@clerk/nextjs/server'
import { getServiceClient } from '../../lib/supabase'
import { anthropic, MODELS } from '../../lib/anthropic'
import { loadJD } from '../../lib/utils/load-jd'
import { loadResume } from '../../lib/utils/load-resume'
import { updateSession } from '../../lib/utils/update-session'
import { exportResume } from '../../lib/utils/export-resume'
import type { CurrentStep } from '../../lib/types'

export const maxDuration = 300

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readSkill(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'skills', `${name}.md`), 'utf-8')
}

const encoder = new TextEncoder()

type OrchestratorEvent =
  | { type: 'session_created'; session_id: string }
  | { type: 'message'; role: 'assistant'; content: string }
  | { type: 'step_complete'; step: CurrentStep }
  | { type: 'error'; code: string; message: string }
  | { type: 'done' }

function makeStream(
  handler: (emit: (event: OrchestratorEvent) => void) => Promise<void>
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function emit(event: OrchestratorEvent) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      try {
        await handler(emit)
      } catch (err) {
        console.error('[orchestrator] unhandled error:', err)
        emit({ type: 'error', code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' })
      } finally {
        emit({ type: 'done' })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

async function storeMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  step: string
) {
  const supabase = getServiceClient()
  await supabase.from('messages').insert({ session_id: sessionId, role, content, step })
}

async function fetchMessages(sessionId: string, step: string) {
  const supabase = getServiceClient()
  const { data } = await supabase
    .from('messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .eq('step', step)
    .order('created_at', { ascending: true })
  return (data ?? []) as { role: 'user' | 'assistant'; content: string }[]
}

async function fetchStorageText(userId: string, sessionId: string, filename: string): Promise<string> {
  const supabase = getServiceClient()
  const { data, error } = await supabase.storage
    .from('squeaky')
    .download(`users/${userId}/${sessionId}/${filename}`)
  if (error || !data) throw new Error(`Failed to fetch ${filename}`)
  return data.text()
}

function parseVerdictBlock(text: string) {
  const get = (field: string) => {
    const match = text.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'))
    return match?.[1]?.trim() ?? ''
  }
  return {
    verdict: get('verdict'),
    hard_req_status: get('hard_req_status'),
    arc_alignment: get('arc_alignment'),
    key_factors: get('key_factors'),
  }
}

// ─── Main route ───────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { session_id, message } = body as {
    session_id: string | null
    message: { type: 'text' | 'file_upload'; content: string; file_name?: string; file_type?: string }
  }

  const supabase = getServiceClient()

  return makeStream(async (emit) => {
    // ── Session setup ───────────────────────────────────────────────────────
    let sessionId = session_id
    let currentStep: CurrentStep = 'created'

    let session: Record<string, unknown> | null = null

    if (!sessionId) {
      // Create new session and fall through to process message
      const { data: newSession, error } = await supabase
        .from('sessions')
        .insert({ user_id: userId, current_step: 'created', status: 'in_progress' })
        .select('id')
        .single()

      if (error || !newSession) {
        emit({ type: 'error', code: 'SESSION_ERROR', message: 'Could not start a new session. Please try again.' })
        return
      }

      sessionId = newSession.id
      emit({ type: 'session_created', session_id: sessionId! })
      session = { current_step: 'created', user_id: userId, arc_alignment: null }
    } else {
      // Fetch existing session
      const { data: existing, error: sessionError } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .single()

      if (sessionError || !existing) {
        emit({ type: 'error', code: 'SESSION_NOT_FOUND', message: 'Session not found. Try starting a new session.' })
        return
      }
      session = existing
    }

    // Guard — TypeScript narrowing after if/else
    if (!sessionId || !session) {
      emit({ type: 'error', code: 'INTERNAL_ERROR', message: 'Session error. Please try again.' })
      return
    }
    const sid: string = sessionId
    const sess: Record<string, unknown> = session

    currentStep = (sess.current_step as CurrentStep) ?? 'created'

    // Store user message immediately (before any Claude call)
    await storeMessage(sid, 'user', message.content || message.file_name || '', currentStep)

    // ── Route by step ───────────────────────────────────────────────────────

    if (currentStep === 'created') {
      await handleCreated({ sessionId: sid, userId, message, session: sess, emit })

    } else if (currentStep === 'jd_loaded') {
      const lower = message.content.toLowerCase().trim()

      if (lower === 'n' || lower === 'no') {
        await updateSession(sid, userId, { current_step: 'created' })
        emit({ type: 'message', role: 'assistant', content: 'OK — paste or upload the job description again.' })
      } else {
        // JD confirmed — now run decode
        await handleDecodeJD({ sessionId: sid, userId, emit })
      }

    } else if (currentStep === 'decoded') {
      // Resume input received — process it directly
      await handleResumeLoaded({ sessionId: sid, userId, message, session: sess, emit })

    } else if (currentStep === 'resume_loaded') {
      await handleResumeLoaded({ sessionId: sid, userId, message, session: sess, emit })

    } else if (currentStep === 'assessed') {
      await handleAssessed({ sessionId: sid, userId, message, session: sess, emit })

    } else if (currentStep === 'targeted') {
      await handleExport({ sessionId: sid, userId, emit })

    } else {
      emit({ type: 'error', code: 'INVALID_STATE', message: 'This session is already complete. Start a new session to work on a different role.' })
    }
  })
}

// ─── Step handlers ────────────────────────────────────────────────────────────

async function handleCreated({ sessionId, userId, message, emit }: {
  sessionId: string; userId: string
  message: { type: string; content: string; file_name?: string; file_type?: string }
  session: Record<string, unknown>
  emit: (e: OrchestratorEvent) => void
}) {
  emit({ type: 'message', role: 'assistant', content: 'Fetching job description...' })

  // Detect input type
  const inputType = message.type === 'file_upload'
    ? 'pdf'
    : message.content.trim().startsWith('http')
      ? 'url'
      : 'text'

  const jdResult = await loadJD({
    type: inputType,
    content: message.content,
    sessionId,
    userId,
  })

  if (!jdResult.success) {
    emit({ type: 'error', code: jdResult.error, message: jdResult.message })
    return
  }

  // Advance to jd_loaded — user must confirm before decode runs
  await updateSession(sessionId, userId, { current_step: 'jd_loaded' })
  emit({ type: 'step_complete', step: 'jd_loaded' })

  // Show the first ~800 chars of raw text so the user can verify this is the right JD
  const preview = jdResult.rawText.slice(0, 800).trim()
  const sparse = jdResult.sparse ? '\n\n_Note: this text looks sparse — the full decode may be limited. You can continue or re-enter._' : ''
  const previewMsg = `Here's what I fetched:\n\n> ${preview}...\n\nDoes this look like the right job description?${sparse}`

  await storeMessage(sessionId, 'assistant', previewMsg, 'jd_loaded')
  emit({ type: 'message', role: 'assistant', content: previewMsg })
}

async function handleDecodeJD({ sessionId, userId, emit }: {
  sessionId: string; userId: string
  emit: (e: OrchestratorEvent) => void
}) {
  emit({ type: 'message', role: 'assistant', content: 'Decoding the role...' })

  const rawText = await fetchStorageText(userId, sessionId, 'raw_jd.md')

  const userMsg = `jd_text: ${rawText}\nsession_id: ${sessionId}\nuser_id: ${userId}`

  const response = await anthropic.messages.create({
    model: MODELS.analysis,
    max_tokens: 8096,
    system: readSkill('jd-decoder'),
    messages: [{ role: 'user', content: userMsg }],
  })

  const decodedText = response.content[0].type === 'text' ? response.content[0].text : ''

  // Parse header for slug/company/role
  const headerMatch = decodedText.match(/^# JD Decoded: (.+?) @ (.+)$/m)
  const roleTitle = headerMatch?.[1]?.trim() ?? ''
  const company = headerMatch?.[2]?.trim() ?? ''
  const slug = `${company}-${roleTitle}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  // Store decoded JD
  const supabase = getServiceClient()
  const storagePath = `users/${userId}/${sessionId}/decoded_jd.md`
  const { error: uploadError } = await supabase.storage.from('squeaky').upload(storagePath, decodedText, { contentType: 'text/markdown', upsert: true })
  if (uploadError) {
    console.error('[handleDecodeJD] storage upload error:', uploadError.message)
    emit({ type: 'error', code: 'UPLOAD_FAILED', message: 'Failed to save the decoded job description. Please try again.' })
    return
  }
  await supabase.from('files').insert({ session_id: sessionId, user_id: userId, file_type: 'decoded_jd', storage_path: storagePath })
  await supabase.from('events').insert({ session_id: sessionId, user_id: userId, event: 'decode_completed' })

  await updateSession(sessionId, userId, { current_step: 'decoded', slug, company, role: roleTitle })
  emit({ type: 'step_complete', step: 'decoded' })

  // Emit the full decoded analysis
  await storeMessage(sessionId, 'assistant', decodedText, 'decoded')
  emit({ type: 'message', role: 'assistant', content: decodedText })

  // Prompt for resume
  const resumePrompt = 'Upload your resume or paste it here.'
  await storeMessage(sessionId, 'assistant', resumePrompt, 'decoded')
  emit({ type: 'message', role: 'assistant', content: resumePrompt })
}

async function handleResumeLoaded({ sessionId, userId, message, emit }: {
  sessionId: string; userId: string
  message: { type: string; content: string; file_name?: string; file_type?: string }
  session: Record<string, unknown>
  emit: (e: OrchestratorEvent) => void
}) {
  // Check if this is a resume input or an arc checkpoint response
  const supabase = getServiceClient()
  const { data: existingMessages } = await supabase
    .from('messages')
    .select('role')
    .eq('session_id', sessionId)
    .eq('step', 'resume_loaded')
    .eq('role', 'assistant')
    .limit(1)

  const hasArcMessage = (existingMessages?.length ?? 0) > 0

  if (!hasArcMessage) {
    // First message in this step — it's the resume
    emit({ type: 'message', role: 'assistant', content: 'Reading your resume...' })

    const fileType = message.type === 'file_upload'
      ? (message.file_type as 'pdf' | 'docx' | 'txt' ?? 'pdf')
      : 'text'

    const resumeResult = await loadResume({
      type: fileType,
      content: message.content,
      sessionId,
      userId,
    })

    if (!resumeResult.success) {
      emit({ type: 'error', code: resumeResult.error, message: resumeResult.message })
      return
    }

    if (resumeResult.short) {
      emit({ type: 'message', role: 'assistant', content: `This looks shorter than a typical resume (${resumeResult.rawText.split('\n').filter(l => l.trim()).length} lines). Continuing — let me know if something looks off.` })
    }

    await updateSession(sessionId, userId, { current_step: 'resume_loaded' })
    emit({ type: 'step_complete', step: 'resume_loaded' })

    // jd-match Turn 1 — arc snapshot
    let decodedJD: string
    try {
      decodedJD = await fetchStorageText(userId, sessionId, 'decoded_jd.md')
    } catch (err) {
      console.error('[handleResumeLoaded] failed to fetch decoded_jd.md:', err)
      emit({ type: 'error', code: 'STORAGE_ERROR', message: 'Couldn\'t load the decoded job description. Please start a new session.' })
      return
    }

    const userMsg = `decoded_jd: ${decodedJD}\nresume: ${JSON.stringify(resumeResult.resume)}\nsession_id: ${sessionId}\nuser_id: ${userId}`

    // Turn 1 — arc snapshot only. Stripped prompt stops after Step 2.
    const turn1System = `${readSkill('jd-match')}

---
TURN 1 INSTRUCTION: Execute Steps 1 and 2 ONLY.
- Extract Sections 10 and 11 from the decoded JD (internal, do not print)
- Print the resume arc snapshot (3–5 bullets)
- Ask the confirmation question
- STOP. Do not proceed to Steps 3–6. Do not run the hard requirements check or verdict.`

    let response
    try {
      response = await anthropic.messages.create({
        model: MODELS.analysis,
        max_tokens: 1024,
        system: turn1System,
        messages: [{ role: 'user', content: userMsg }],
      })
    } catch (err) {
      console.error('[handleResumeLoaded] jd-match Turn 1 error:', err)
      emit({ type: 'error', code: 'API_ERROR', message: 'The analysis failed. Please try again.' })
      return
    }

    const arcText = response.content[0].type === 'text' ? response.content[0].text : ''
    await storeMessage(sessionId, 'user', userMsg, 'resume_loaded')
    await storeMessage(sessionId, 'assistant', arcText, 'resume_loaded')
    emit({ type: 'message', role: 'assistant', content: arcText })

  } else {
    // Arc checkpoint response — run jd-match Turn 2
    const messages = await fetchMessages(sessionId, 'resume_loaded')

    if (messages.filter(m => m.role === 'assistant').length === 0) {
      // Missing messages fallback — restart Turn 1 silently
      console.error('[orchestrator] missing messages fallback for resume_loaded step, session:', sessionId)
      await handleResumeLoaded({ sessionId, userId, message: { type: 'text', content: '' }, session: {}, emit })
      return
    }

    emit({ type: 'message', role: 'assistant', content: 'Assessing fit...' })

    const allMessages = [...messages, { role: 'user' as const, content: message.content }]

    const decodedJD = await fetchStorageText(userId, sessionId, 'decoded_jd.md')
    const systemMsg = `decoded_jd context already provided in conversation.\n\n${readSkill('jd-match')}`

    const response = await anthropic.messages.create({
      model: MODELS.analysis,
      max_tokens: 8096,
      system: systemMsg,
      messages: allMessages,
    })

    const assessmentText = response.content[0].type === 'text' ? response.content[0].text : ''
    const parsed = parseVerdictBlock(assessmentText)

    // Store assessment
    const storagePath = `users/${userId}/${sessionId}/fit_assessment.md`
    const supabase = getServiceClient()
    await supabase.storage.from('squeaky').upload(storagePath, assessmentText, { contentType: 'text/markdown', upsert: true })
    await supabase.from('files').insert({ session_id: sessionId, user_id: userId, file_type: 'fit_assessment', storage_path: storagePath })
    await supabase.from('events').insert({ session_id: sessionId, user_id: userId, event: 'verdict_delivered' })

    await storeMessage(sessionId, 'assistant', assessmentText, 'resume_loaded')
    await updateSession(sessionId, userId, {
      current_step: 'assessed',
      verdict: parsed.verdict,
      hard_req_status: parsed.hard_req_status,
      arc_alignment: parsed.arc_alignment as 'strong' | 'partial' | 'weak',
      key_factors: parsed.key_factors,
    })

    emit({ type: 'step_complete', step: 'assessed' })
    emit({ type: 'message', role: 'assistant', content: assessmentText })
    emit({ type: 'message', role: 'assistant', content: 'Want to target your resume for this role, or pass on this one?' })
  }
}

async function handleAssessed({ sessionId, userId, message, session, emit }: {
  sessionId: string; userId: string
  message: { type: string; content: string; file_name?: string; file_type?: string }
  session: Record<string, unknown>
  emit: (e: OrchestratorEvent) => void
}) {
  const lower = message.content.toLowerCase()
  const isPass = /\b(pass|not pursuing|not interested|i'll pass|i will pass)\b/.test(lower)

  if (isPass) {
    await updateSession(sessionId, userId, { current_step: 'not_pursuing', status: 'not_pursuing' })
    emit({ type: 'step_complete', step: 'not_pursuing' })
    emit({ type: 'message', role: 'assistant', content: 'Got it. This session is saved to your pipeline. Start a new session to work on a different role.' })
    return
  }

  // Check if scope has been confirmed (assistant has already proposed scope)
  const supabase = getServiceClient()
  const { data: assessedMessages } = await supabase
    .from('messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .eq('step', 'assessed')
    .order('created_at', { ascending: true })

  const hasProposedScope = (assessedMessages ?? []).some(m => m.role === 'assistant' && m.content.includes("I'll rewrite"))

  if (!hasProposedScope) {
    // Propose scope based on arc_alignment
    const arcAlignment = session.arc_alignment as string
    const resume = JSON.parse(await fetchStorageText(userId, sessionId, 'resume_structured.json'))
    const roles: { id: string; title: string; company: string }[] = resume.experience ?? []

    const scopeCount = arcAlignment === 'weak' ? 1 : 2
    const proposed = roles.slice(0, scopeCount)
    const roleList = proposed.map(r => `${r.title} at ${r.company}`).join(' and ')

    const scopeMsg = `I'll rewrite ${roleList}. Want to include any other roles, or does this scope work?`
    await storeMessage(sessionId, 'assistant', scopeMsg, 'assessed')
    emit({ type: 'message', role: 'assistant', content: scopeMsg })

  } else {
    // Scope confirmed — run resume-targeting Turn 1
    const resume = JSON.parse(await fetchStorageText(userId, sessionId, 'resume_structured.json'))
    const roles: { id: string; title: string; company: string }[] = resume.experience ?? []

    // Extract confirmed scope IDs from conversation
    let scopeIds: string[]
    if (lower.includes('yes') || lower.includes('looks good') || lower.includes('confirm') || lower.includes('ok') || lower.includes('sure')) {
      // Find the proposed roles from the scope message
      const scopeMsg = (assessedMessages ?? []).find(m => m.role === 'assistant' && m.content.includes("I'll rewrite"))
      const arcAlignment = session.arc_alignment as string
      const scopeCount = arcAlignment === 'weak' ? 1 : 2
      scopeIds = roles.slice(0, scopeCount).map(r => r.id)
    } else {
      // User may have named specific roles — use all for now, could be smarter
      scopeIds = roles.slice(0, 2).map(r => r.id)
    }

    const decodedJD = await fetchStorageText(userId, sessionId, 'decoded_jd.md')
    const userMsg = `decoded_jd: ${decodedJD}\nresume: ${JSON.stringify(resume)}\nscope: ${JSON.stringify(scopeIds)}\nsession_id: ${sessionId}\nuser_id: ${userId}`

    emit({ type: 'message', role: 'assistant', content: 'Auditing your bullets...' })

    const response = await anthropic.messages.create({
      model: MODELS.analysis,
      max_tokens: 4096,
      system: readSkill('resume-targeting'),
      messages: [{ role: 'user', content: userMsg }],
    })

    const turn1Text = response.content[0].type === 'text' ? response.content[0].text : ''
    await storeMessage(sessionId, 'user', userMsg, 'assessed')
    await storeMessage(sessionId, 'assistant', turn1Text, 'assessed')

    const totalBullets = roles
      .filter(r => scopeIds.includes(r.id))
      .reduce((sum, r) => sum + ((resume.experience.find((e: { id: string }) => e.id === r.id)?.bullets?.length) ?? 0), 0)

    await updateSession(sessionId, userId, { bullets_total: totalBullets })
    emit({ type: 'message', role: 'assistant', content: turn1Text })

    // Check if Turn 1 asked for numbers — if it ends with a question, wait for response
    // Otherwise, proceed to Turn 2 immediately
    if (turn1Text.includes('Before I rewrite') || turn1Text.includes('I need a few numbers')) {
      // Waiting for numbers response — stay in 'assessed'
    } else {
      // No numbers needed — run Turn 2 immediately
      await runTargetingTurn2({ sessionId, userId, decodedJD, resume, scopeIds, emit })
    }
  }
}

async function runTargetingTurn2({ sessionId, userId, decodedJD, resume, scopeIds, emit }: {
  sessionId: string; userId: string
  decodedJD: string; resume: unknown; scopeIds: string[]
  emit: (e: OrchestratorEvent) => void
}) {
  emit({ type: 'message', role: 'assistant', content: 'Rewriting bullets...' })

  const messages = await fetchMessages(sessionId, 'assessed')
  const response = await anthropic.messages.create({
    model: MODELS.analysis,
    max_tokens: 8096,
    system: readSkill('resume-targeting'),
    messages,
  })

  const turn2Text = response.content[0].type === 'text' ? response.content[0].text : ''

  // Extract JSON from response
  const jsonMatch = turn2Text.match(/```json\n([\s\S]+?)\n```/) ?? turn2Text.match(/(\{[\s\S]+\})/)
  if (!jsonMatch) {
    emit({ type: 'error', code: 'PARSE_ERROR', message: 'Couldn\'t parse targeting output. Please try again.' })
    return
  }

  const targetingOutput = JSON.parse(jsonMatch[1])

  const supabase = getServiceClient()
  const storagePath = `users/${userId}/${sessionId}/targeted_resume.json`
  await supabase.storage.from('squeaky').upload(storagePath, JSON.stringify(targetingOutput, null, 2), { contentType: 'application/json', upsert: true })
  await supabase.from('files').insert({ session_id: sessionId, user_id: userId, file_type: 'targeted_resume', storage_path: storagePath })
  await supabase.from('events').insert({ session_id: sessionId, user_id: userId, event: 'resume_targeted' })

  await storeMessage(sessionId, 'assistant', turn2Text, 'assessed')
  await updateSession(sessionId, userId, {
    current_step: 'targeted',
    bullets_total: targetingOutput.rewrites?.length ?? 0,
  })

  emit({ type: 'step_complete', step: 'targeted' })
  emit({ type: 'message', role: 'assistant', content: 'Done. Review the changes below.' })
}

async function handleExport({ sessionId, userId, emit }: {
  sessionId: string; userId: string
  emit: (e: OrchestratorEvent) => void
}) {
  emit({ type: 'message', role: 'assistant', content: 'Generating your resume...' })

  const result = await exportResume({ sessionId, userId })

  if (!result.success) {
    emit({ type: 'error', code: result.error, message: result.message })
    return
  }

  await updateSession(sessionId, userId, {
    current_step: 'exported',
    status: 'completed',
    docx_downloaded: true,
    downloaded_at: new Date().toISOString(),
  })

  emit({ type: 'step_complete', step: 'exported' })
  emit({ type: 'message', role: 'assistant', content: `Your resume is ready. [Download](${result.downloadUrl})` })
}
