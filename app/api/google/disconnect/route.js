import { googleConfigured } from '@/lib/google/config'
import { json, jsonError, requireUser, unauthorized } from '@/lib/google/http'
import { disconnectUser } from '@/lib/google/sync'

export const runtime = 'nodejs'

export async function POST() {
  const { user } = await requireUser()
  if (!user) return unauthorized()
  if (!googleConfigured()) {
    return json({ error: 'Google Calendar is not turned on for Home yet.' }, 409)
  }
  try {
    await disconnectUser(user.id)
    return json({ ok: true })
  } catch (error) {
    return jsonError(error)
  }
}
