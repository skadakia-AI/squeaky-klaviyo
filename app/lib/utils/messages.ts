import { getServiceClient } from '../supabase'

export async function storeMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  step: string
): Promise<void> {
  const supabase = getServiceClient()
  await supabase.from('messages').insert({ session_id: sessionId, role, content, step })
}

export async function fetchMessages(
  sessionId: string,
  step: string
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  const supabase = getServiceClient()
  const { data } = await supabase
    .from('messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .eq('step', step)
    .order('created_at', { ascending: true })
  return (data ?? []) as { role: 'user' | 'assistant'; content: string }[]
}
