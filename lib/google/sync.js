import 'server-only'
import { googleConfigured } from './config.js'
import { chooseSyncOwner, colorForCalendar, isWritableRole, suggestSelected } from './calendarChoice.js'
import {
  clearCachedAccessToken,
  createGoogleEvent,
  deleteGoogleEvent,
  findGoogleEventByDashboardId,
  listGoogleCalendars,
  listGoogleEvents,
  requireActiveConnection,
  syncWindow,
  updateGoogleEvent,
} from './client.js'
import { SYNC_THROTTLE_MS } from './constants.js'
import { GoogleApiError } from './errors.js'
import { eventRowToInput, fromGoogleEvent, toGoogleEventBody } from './mapEvent.js'
import { planGoogleSync } from './planSync.js'
import { hasRequiredScopes } from './scopes.js'
import {
  applySyncPlan,
  deleteConnection,
  deleteEvent,
  getConnection,
  getEvent,
  insertEvent,
  listCalendars,
  listConnections,
  listSyncEventRows,
  listUnlinkedEvents,
  replaceUserCalendars,
  setCalendarSelected,
  touchConnections,
  updateEvent,
} from './store.js'

function emptyResult(skipped) {
  return { ok: true, skipped, upserted: 0, removed: 0, calendarErrors: [] }
}

function isFresh(connection) {
  if (!connection?.last_synced_at) return false
  const age = Date.now() - new Date(connection.last_synced_at).getTime()
  return age >= 0 && age < SYNC_THROTTLE_MS
}

async function mapPool(items, limit, fn) {
  const results = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await fn(items[index], index)
    }
  }
  const workers = Math.min(limit, items.length)
  if (workers) await Promise.all(Array.from({ length: workers }, () => worker()))
  return results
}

function eventPatch(input, googleEvent, calendar) {
  const mapped = fromGoogleEvent(googleEvent)
  const fields = mapped || {
    title: input.title,
    description: input.description || null,
    all_day: Boolean(input.allDay),
    start_date: input.startDate,
    end_date: input.endDate || input.startDate,
    start_time: input.allDay ? null : (input.startIso || null),
    end_time: input.allDay ? null : (input.endIso || null),
  }
  return {
    ...fields,
    google_calendar_id: calendar.google_calendar_id,
    google_event_id: googleEvent.id,
    calendar_name: String(calendar.summary || 'Calendar').slice(0, 200),
    calendar_color: colorForCalendar(calendar.google_calendar_id, calendar.background_color),
    google_owner_id: calendar.user_id,
  }
}

async function ownWritableCalendar(userId, calendarId) {
  const calendars = await listCalendars()
  const calendar = calendars.find((item) => (
    item.user_id === userId
    && item.google_calendar_id === calendarId
    && item.selected
    && isWritableRole(item.access_role)
  ))
  if (!calendar) return null
  const connection = await requireActiveConnection(userId)
  if (!hasRequiredScopes(connection.scope)) {
    throw new GoogleApiError('Google needs you to connect again and allow calendar access.', {
      status: 409,
      code: 'needs_reconnect',
      needsReconnect: true,
    })
  }
  return { calendar, connection }
}

async function findWritableCalendar(calendarId, preferredUserId) {
  const calendars = (await listCalendars()).filter((item) => (
    item.google_calendar_id === calendarId && isWritableRole(item.access_role)
  ))
  calendars.sort((a, b) => {
    if (a.user_id === preferredUserId) return -1
    if (b.user_id === preferredUserId) return 1
    if (a.selected !== b.selected) return a.selected ? -1 : 1
    return String(a.user_id).localeCompare(String(b.user_id))
  })
  for (const calendar of calendars) {
    const connection = await getConnection(calendar.user_id, { secrets: true })
    if (!connection || connection.token_status !== 'active' || !hasRequiredScopes(connection.scope)) continue
    return { calendar, connection }
  }
  return null
}

export async function refreshCalendarsForUser(userId) {
  const connection = await requireActiveConnection(userId)
  if (!hasRequiredScopes(connection.scope)) {
    throw new GoogleApiError('Google needs you to connect again and allow calendar access.', {
      status: 409,
      code: 'needs_reconnect',
      needsReconnect: true,
    })
  }
  const remote = await listGoogleCalendars(connection)
  return replaceUserCalendars(userId, remote, suggestSelected)
}

export async function removeUnselectedGoogleEvents() {
  const calendars = await listCalendars()
  const selectedCalendarIds = calendars.filter((calendar) => calendar.selected).map((calendar) => calendar.google_calendar_id)
  const existing = await listSyncEventRows()
  const plan = planGoogleSync({
    existing,
    incoming: [],
    selectedCalendarIds,
    syncedCalendarIds: [],
    windowStart: '0000-01-01',
    windowEnd: '9999-12-31',
    idFactory: () => crypto.randomUUID(),
  })
  if (plan.deleteIds.length) await applySyncPlan({ upserts: [], deleteIds: plan.deleteIds })
  return plan.deleteIds.length
}

export async function syncHouseholdFromGoogle({ force = false } = {}) {
  if (!googleConfigured()) return emptyResult('not_configured')

  let connections
  try {
    connections = await listConnections({ secrets: true })
  } catch (error) {
    if (error instanceof GoogleApiError && error.code === 'needs_migration') return emptyResult('needs_migration')
    throw error
  }
  if (!connections.length) return emptyResult('not_connected')

  const usable = connections.filter((connection) => (
    connection.token_status === 'active' && hasRequiredScopes(connection.scope)
  ))
  if (!usable.length) return emptyResult('needs_reconnect')
  if (!force && usable.every(isFresh)) return emptyResult('recent')

  const calendars = await listCalendars()
  const selected = calendars.filter((calendar) => calendar.selected)
  const selectedCalendarIds = [...new Set(selected.map((calendar) => calendar.google_calendar_id))]
  const activeUsers = new Map(usable.map((connection) => [connection.user_id, connection]))
  const groups = new Map()
  for (const calendar of selected) {
    if (!activeUsers.has(calendar.user_id)) continue
    const list = groups.get(calendar.google_calendar_id) || []
    list.push(calendar)
    groups.set(calendar.google_calendar_id, list)
  }

  const window = syncWindow()
  const incoming = []
  const syncedCalendarIds = []
  const calendarErrors = []
  const blocked = new Set()
  const jobs = []
  for (const [calendarId, rows] of groups) {
    const choice = chooseSyncOwner(rows.map((row) => ({
      userId: row.user_id,
      accessRole: row.access_role,
      primary: row.primary_calendar,
      row,
    })))
    if (!choice?.row) continue
    jobs.push({ calendarId, row: choice.row, userId: choice.userId })
  }

  await mapPool(jobs, 3, async (job) => {
    if (blocked.has(job.userId)) return
    const connection = activeUsers.get(job.userId)
    try {
      const { events, truncated } = await listGoogleEvents(connection, job.calendarId, window)
      const name = job.row.summary || 'Calendar'
      if (truncated) {
        calendarErrors.push({ name, message: 'Only part of this calendar was read. Sync again for the rest.' })
      }
      const color = colorForCalendar(job.calendarId, job.row.background_color)
      for (const googleEvent of events) {
        if (!googleEvent?.id || googleEvent.status === 'cancelled') continue
        const mapped = fromGoogleEvent(googleEvent)
        if (!mapped) continue
        incoming.push({
          ...mapped,
          google_calendar_id: job.calendarId,
          google_event_id: googleEvent.id,
          calendar_name: name,
          calendar_color: color,
          google_owner_id: job.userId,
          created_by: job.userId,
        })
      }
      if (!truncated) syncedCalendarIds.push(job.calendarId)
    } catch (error) {
      if (error instanceof GoogleApiError && (error.code === 'needs_reconnect' || error.needsReconnect)) {
        blocked.add(job.userId)
      }
      calendarErrors.push({
        name: job.row.summary || 'Calendar',
        message: error instanceof GoogleApiError ? error.message : 'Could not read this calendar.',
      })
    }
  })

  const existing = await listSyncEventRows()
  const plan = planGoogleSync({
    existing,
    incoming,
    selectedCalendarIds,
    syncedCalendarIds,
    windowStart: window.windowStart,
    windowEnd: window.windowEnd,
    idFactory: () => crypto.randomUUID(),
  })
  await applySyncPlan(plan)
  const touched = usable.filter((connection) => !blocked.has(connection.user_id)).map((connection) => connection.user_id)
  await touchConnections(touched)

  return {
    ok: true,
    skipped: null,
    upserted: plan.upserts.length,
    removed: plan.deleteIds.length,
    calendarErrors: calendarErrors.slice(0, 5),
  }
}

export async function syncHouseholdQuietly() {
  try {
    return await syncHouseholdFromGoogle()
  } catch (error) {
    console.error('google calendar sync', error instanceof GoogleApiError ? error.code : 'failed')
    return { ok: false, skipped: 'error', upserted: 0, removed: 0, calendarErrors: [] }
  }
}

export async function disconnectUser(userId) {
  clearCachedAccessToken(userId)
  await deleteConnection(userId)
  try {
    await removeUnselectedGoogleEvents()
  } catch (error) {
    console.error('google disconnect cleanup', error instanceof GoogleApiError ? error.code : 'failed')
  }
}

export async function selectCalendar(userId, googleCalendarId, selected) {
  const row = await setCalendarSelected(userId, googleCalendarId, selected)
  if (!selected) {
    await removeUnselectedGoogleEvents()
    return { calendar: row, sync: emptyResult('unselected') }
  }
  const sync = await syncHouseholdFromGoogle({ force: true })
  return { calendar: row, sync }
}

export async function createLinkedEvent(userId, input) {
  if (!input.calendarId) {
    throw new GoogleApiError('Choose a Google calendar.', { status: 400, code: 'calendar' })
  }
  const owned = await ownWritableCalendar(userId, input.calendarId)
  if (!owned) {
    throw new GoogleApiError('Choose one of your calendars that Google lets you edit.', { status: 400, code: 'calendar' })
  }
  const id = crypto.randomUUID()
  const created = await createGoogleEvent(
    owned.connection,
    input.calendarId,
    toGoogleEventBody({ ...input, dashboardId: id })
  )
  if (!created?.id) {
    throw new GoogleApiError('Google Calendar did not save that event.', { status: 502, code: 'google_error' })
  }
  try {
    return await insertEvent({
      id,
      created_by: userId,
      origin: 'dashboard',
      ...eventPatch(input, created, owned.calendar),
    })
  } catch (error) {
    await deleteGoogleEvent(owned.connection, input.calendarId, created.id).catch(() => {})
    throw error
  }
}

export async function updateLinkedEvent(userId, id, input) {
  const row = await getEvent(id)
  if (!row) throw new GoogleApiError('That event is no longer here.', { status: 404, code: 'not_found' })

  if (!row.google_event_id) {
    if (!input.calendarId) {
      throw new GoogleApiError('This event is only in Home.', { status: 400, code: 'local_only' })
    }
    const owned = await ownWritableCalendar(userId, input.calendarId)
    if (!owned) {
      throw new GoogleApiError('Choose one of your calendars that Google lets you edit.', { status: 400, code: 'calendar' })
    }
    const known = await findGoogleEventByDashboardId(owned.connection, input.calendarId, id).catch(() => null)
    const googleEvent = known || await createGoogleEvent(
      owned.connection,
      input.calendarId,
      toGoogleEventBody({ ...input, dashboardId: id })
    )
    if (!googleEvent?.id) {
      throw new GoogleApiError('Google Calendar did not save that event.', { status: 502, code: 'google_error' })
    }
    try {
      return await updateEvent(id, eventPatch(input, googleEvent, owned.calendar))
    } catch (error) {
      if (!known) await deleteGoogleEvent(owned.connection, input.calendarId, googleEvent.id).catch(() => {})
      throw error
    }
  }

  const writer = await findWritableCalendar(row.google_calendar_id, userId)
  if (!writer) {
    throw new GoogleApiError('That Google calendar is not connected right now. Reconnect it, then edit again.', {
      status: 409,
      code: 'not_connected',
    })
  }
  const body = toGoogleEventBody({ ...input, dashboardId: id })
  let googleEvent
  try {
    googleEvent = await updateGoogleEvent(writer.connection, row.google_calendar_id, row.google_event_id, body)
  } catch (error) {
    if (!(error instanceof GoogleApiError) || error.code !== 'not_found') throw error
    googleEvent = await createGoogleEvent(writer.connection, row.google_calendar_id, body)
  }
  if (!googleEvent?.id) {
    throw new GoogleApiError('Google Calendar did not save that event.', { status: 502, code: 'google_error' })
  }
  return updateEvent(id, eventPatch(input, googleEvent, writer.calendar))
}

export async function deleteLinkedEvent(userId, id) {
  const row = await getEvent(id)
  if (!row) throw new GoogleApiError('That event is no longer here.', { status: 404, code: 'not_found' })
  if (!row.google_event_id || !row.google_calendar_id) {
    throw new GoogleApiError('This event is only in Home.', { status: 400, code: 'local_only' })
  }
  const writer = await findWritableCalendar(row.google_calendar_id, userId)
  if (!writer) {
    throw new GoogleApiError('That Google calendar is not connected right now. Reconnect it, then delete again.', {
      status: 409,
      code: 'not_connected',
    })
  }
  await deleteGoogleEvent(writer.connection, row.google_calendar_id, row.google_event_id)
  await deleteEvent(id)
}

export async function importLocalEvents(userId, googleCalendarId) {
  const owned = await ownWritableCalendar(userId, googleCalendarId)
  if (!owned) {
    throw new GoogleApiError('Choose one of your calendars that Google lets you edit.', { status: 400, code: 'calendar' })
  }
  const { rows, total } = await listUnlinkedEvents(200)
  let knownById = new Map()
  if (rows.length) {
    try {
      const { events } = await listGoogleEvents(owned.connection, googleCalendarId, syncWindow())
      knownById = new Map()
      for (const event of events) {
        const dashboardId = event?.extendedProperties?.private?.dashboardId
        if (dashboardId && event.id && event.status !== 'cancelled') knownById.set(dashboardId, event)
      }
    } catch (error) {
      if (error instanceof GoogleApiError && error.needsReconnect) throw error
    }
  }

  const results = await mapPool(rows, 3, async (row) => {
    const known = knownById.get(row.id) || null
    let createdId = null
    try {
      const googleEvent = known || await createGoogleEvent(
        owned.connection,
        googleCalendarId,
        toGoogleEventBody(eventRowToInput(row))
      )
      if (!known) createdId = googleEvent?.id || null
      if (!googleEvent?.id) return { ok: false, title: row.title, message: 'Google Calendar did not save that event.' }
      await updateEvent(row.id, eventPatch(eventRowToInput(row), googleEvent, owned.calendar))
      return { ok: true }
    } catch (error) {
      if (createdId) await deleteGoogleEvent(owned.connection, googleCalendarId, createdId).catch(() => {})
      return { ok: false, title: row.title, message: error?.message || 'Could not copy this event.' }
    }
  })

  const failed = results.filter((result) => result && !result.ok)
  await syncHouseholdFromGoogle({ force: true }).catch(() => {})
  return {
    imported: results.length - failed.length,
    failed: failed.slice(0, 8).map((result) => ({ title: result.title, message: result.message })),
    failedCount: failed.length,
    capped: total > rows.length,
  }
}
