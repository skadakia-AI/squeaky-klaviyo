import type { ActiveSession, StoredMessage } from './types'

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
  excludedOutOfScopeRoles: string[]
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
      }),
    })
    if (!res.ok) return { success: false }
    return res.json()
  } catch {
    return { success: false }
  }
}
