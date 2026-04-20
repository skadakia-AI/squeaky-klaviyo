import type { ActiveSession, DashboardSession, StoredMessage, Resume, TargetingOutput, SummaryRewrite } from './types'

export async function fetchSessions(): Promise<DashboardSession[]> {
  try {
    const res = await fetch('/api/sessions')
    if (!res.ok) return []
    const data = await res.json()
    return data.sessions ?? []
  } catch {
    return []
  }
}

export async function fetchSessionById(sessionId: string): Promise<{ session: ActiveSession; messages: StoredMessage[] } | null> {
  try {
    const res = await fetch(`/api/session/${sessionId}`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function fetchArtifact(sessionId: string, type: 'jd' | 'fit' | 'resume'): Promise<string | null> {
  try {
    const res = await fetch(`/api/session/${sessionId}/artifacts?type=${type}`)
    if (!res.ok) return null
    const data = await res.json()
    return data.content ?? null
  } catch {
    return null
  }
}

export async function triggerExport(sessionId: string): Promise<{ downloadUrl: string } | null> {
  try {
    const res = await fetch(`/api/session/${sessionId}/export`, { method: 'POST' })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function fetchTargetingData(sessionId: string): Promise<{ resume: Resume; targeting: TargetingOutput | null; summaryRewrite: SummaryRewrite | null } | null> {
  try {
    const res = await fetch(`/api/session/${sessionId}/targeting`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function archiveSession(sessionId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/session/${sessionId}`, { method: 'DELETE' })
    return res.ok
  } catch {
    return false
  }
}

export async function getActiveSession(): Promise<{ session: ActiveSession | null; messages: StoredMessage[] }> {
  try {
    const res = await fetch('/api/session/active')
    if (!res.ok) return { session: null, messages: [] }
    return res.json()
  } catch {
    return { session: null, messages: [] }
  }
}

export async function postReviews(
  sessionId: string,
  bulletReviews: Record<string, boolean>,
  bulletEdits: Record<string, string>,
  excludedOutOfScopeRoles: string[],
  summaryAccepted?: boolean,
  summaryEdit?: string
): Promise<{ success: boolean }> {
  try {
    const accepted = Object.values(bulletReviews).filter(Boolean).length
    const res = await fetch('/api/session/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        bullet_reviews: bulletReviews,
        bullet_edits: bulletEdits,
        bullets_accepted: accepted,
        excluded_out_of_scope_roles: excludedOutOfScopeRoles,
        summary_accepted: summaryAccepted,
        summary_edit: summaryEdit ?? null,
      }),
    })
    if (!res.ok) return { success: false }
    return res.json()
  } catch {
    return { success: false }
  }
}
