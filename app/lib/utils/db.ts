import type { SupabaseClient } from '@supabase/supabase-js'

// Every function that takes sessionId also takes userId and scopes the query to that user.
// Direct supabase.from('sessions') calls in API routes should use these instead.

export async function createSession(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('sessions')
    .insert({ user_id: userId, current_step: 'created', status: 'in_progress' })
    .select('id')
    .single()
  return error ? null : (data as { id: string })
}

export async function getSession(supabase: SupabaseClient, sessionId: string, userId: string) {
  const { data } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single()
  return data ?? null
}

export async function getActiveSession(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from('sessions')
    .select('id, role, company, current_step, created_at, updated_at')
    .eq('user_id', userId)
    .eq('status', 'in_progress')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()
  return data ?? null
}

// Updates a session only if owned by userId. Returns false on error or missing ownership.
export async function patchSession(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
  updates: Record<string, unknown>
) {
  const { error } = await supabase
    .from('sessions')
    .update(updates)
    .eq('id', sessionId)
    .eq('user_id', userId)
  return !error
}
