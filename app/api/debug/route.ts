import { getServiceClient } from '../../lib/supabase'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY

  let dbResult: string
  try {
    const supabase = getServiceClient()
    const { error } = await supabase.from('sessions').select('id').limit(1)
    dbResult = error ? `DB error: ${error.message} (code: ${error.code})` : 'DB connection OK'
  } catch (e) {
    dbResult = `Exception: ${e instanceof Error ? e.message : String(e)}`
  }

  return Response.json({ url, hasServiceKey, dbResult })
}
