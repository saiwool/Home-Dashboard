import { json, jsonError, readJson, requireUser, unauthorized } from '@/lib/google/http'
import { refreshCalendarsForUser, selectCalendar } from '@/lib/google/sync'

export const runtime = 'nodejs'

export async function POST(request) {
  const { user } = await requireUser()
  if (!user) return unauthorized()
  const body = await readJson(request)
  const action = body?.action
  try {
    if (action === 'refresh') {
      const calendars = await refreshCalendarsForUser(user.id)
      return json({ ok: true, count: calendars.length })
    }
    if (action === 'select') {
      const googleCalendarId = String(body?.googleCalendarId || '').trim()
      if (!googleCalendarId) return json({ error: 'Choose a calendar.' }, 400)
      const result = await selectCalendar(user.id, googleCalendarId, Boolean(body?.selected))
      return json({ ok: true, selected: result.calendar.selected, sync: result.sync })
    }
    return json({ error: 'Choose a calendar action.' }, 400)
  } catch (error) {
    return jsonError(error)
  }
}
