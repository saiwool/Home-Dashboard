import { json, jsonError, readJson, requireUser, unauthorized } from '@/lib/google/http'
import { importLocalEvents } from '@/lib/google/sync'

export const runtime = 'nodejs'

export async function POST(request) {
  const { user } = await requireUser()
  if (!user) return unauthorized()
  const body = await readJson(request)
  const googleCalendarId = String(body?.googleCalendarId || '').trim()
  if (!googleCalendarId) return json({ error: 'Choose a calendar first.' }, 400)
  try {
    return json(await importLocalEvents(user.id, googleCalendarId))
  } catch (error) {
    return jsonError(error)
  }
}
