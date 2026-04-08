import { getServiceClient } from '../supabase'

type SessionUpdate = {
  current_step?: string
  status?: string
  verdict?: string
  hard_req_status?: string
  arc_alignment?: string
  key_factors?: string
  slug?: string
  company?: string
  role?: string
  bullets_total?: number
  bullets_accepted?: number
  bullet_reviews?: Record<string, boolean>
  bullet_edits?: Record<string, string>
  docx_downloaded?: boolean
  downloaded_at?: string
}

export async function updateSession(
  sessionId: string,
  userId: string,
  updates: SessionUpdate
): Promise<void> {
  const supabase = getServiceClient()
  const { error } = await supabase
    .from('sessions')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('user_id', userId)

  if (error) {
    console.error('[update-session] error:', error.message)
    // Non-blocking — orchestrator continues even if update fails
  }
}
