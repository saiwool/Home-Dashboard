import { json, jsonError, requireUser, unauthorized } from '@/lib/google/http'
import { getGoogleStatus } from '@/lib/google/status'

export const runtime = 'nodejs'

export async function GET(request) {
  const { supabase, user } = await requireUser()
  if (!user) return unauthorized()
  try {
    return json(await getGoogleStatus(request, supabase, user))
  } catch (error) {
    return jsonError(error)
  }
}
