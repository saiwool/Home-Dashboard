import { json, jsonError, requireUser, unauthorized } from '@/lib/google/http'
import { syncFromGoogle } from '@/lib/google/sync'

export const runtime = 'nodejs'

export async function POST() {
  const { user } = await requireUser()
  if (!user) return unauthorized()
  try {
    return json(await syncFromGoogle(user.id))
  } catch (error) {
    return jsonError(error)
  }
}
