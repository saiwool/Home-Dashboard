import { json, jsonError, requireUser, unauthorized } from '@/lib/google/http'
import { getGoogleStatus } from '@/lib/google/status'

export const runtime = 'nodejs'

export async function GET(request) {
  const { supabase, user } = await requireUser()
  if (!user) return unauthorized()
  try {
    const status = await getGoogleStatus(request, supabase)
    return json(status)
  } catch (error) {
    return jsonError(error)
  }
}
