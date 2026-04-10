import { getServiceClient } from '../supabase'

export function storagePath(userId: string, sessionId: string, filename: string): string {
  return `users/${userId}/${sessionId}/${filename}`
}

export async function readFile(userId: string, sessionId: string, filename: string): Promise<string> {
  const supabase = getServiceClient()
  const { data, error } = await supabase.storage
    .from('squeaky')
    .download(storagePath(userId, sessionId, filename))
  if (error || !data) throw new Error(`Failed to fetch ${filename}: ${error?.message}`)
  return data.text()
}

export async function writeFile(
  userId: string,
  sessionId: string,
  filename: string,
  content: string,
  contentType: string
): Promise<void> {
  const supabase = getServiceClient()
  const { error } = await supabase.storage
    .from('squeaky')
    .upload(storagePath(userId, sessionId, filename), content, { contentType, upsert: true })
  if (error) throw new Error(`Failed to write ${filename}: ${error.message}`)
}
