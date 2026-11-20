export function googleEventKey(calendarId, eventId) {
  return `${calendarId}\n${eventId}`
}

function linked(row) {
  return Boolean(row?.google_calendar_id && row?.google_event_id)
}

// One household row per Google event. The same shared calendar selected by
// both people collapses to the row that is already stored.
export function planGoogleSync({
  existing,
  incoming,
  selectedCalendarIds,
  syncedCalendarIds,
  windowStart,
  windowEnd,
  idFactory,
}) {
  const selected = new Set(selectedCalendarIds || [])
  const synced = new Set(syncedCalendarIds || [])
  const byKey = new Map()
  for (const row of existing || []) {
    if (!linked(row)) continue
    const key = googleEventKey(row.google_calendar_id, row.google_event_id)
    if (!byKey.has(key)) byKey.set(key, row)
  }

  const seen = new Set()
  const upserts = []
  for (const event of incoming || []) {
    if (!linked(event) || !event.start_date) continue
    const key = googleEventKey(event.google_calendar_id, event.google_event_id)
    if (seen.has(key)) continue
    seen.add(key)
    const prior = byKey.get(key)
    const allDay = event.all_day !== false
    upserts.push({
      id: prior?.id || idFactory(),
      created_by: prior?.created_by || event.created_by,
      origin: prior?.origin === 'dashboard' ? 'dashboard' : 'google',
      google_calendar_id: event.google_calendar_id,
      google_event_id: event.google_event_id,
      title: event.title,
      description: event.description ?? null,
      all_day: allDay,
      start_date: event.start_date,
      end_date: event.end_date || event.start_date,
      start_time: allDay ? null : (event.start_time || null),
      end_time: allDay ? null : (event.end_time || null),
      calendar_name: event.calendar_name || null,
      calendar_color: event.calendar_color || null,
      google_owner_id: event.google_owner_id || prior?.google_owner_id || null,
    })
  }

  const deleteIds = []
  const seenDelete = new Set()
  function addDelete(id) {
    if (!id || seenDelete.has(id)) return
    seenDelete.add(id)
    deleteIds.push(id)
  }

  for (const row of existing || []) {
    if (!linked(row)) continue
    const key = googleEventKey(row.google_calendar_id, row.google_event_id)
    if (seen.has(key)) continue
    if (!selected.has(row.google_calendar_id)) {
      if (row.origin !== 'dashboard') addDelete(row.id)
      continue
    }
    if (!synced.has(row.google_calendar_id)) continue
    if (!row.start_date || row.start_date < windowStart || row.start_date > windowEnd) continue
    addDelete(row.id)
  }

  return { upserts, deleteIds }
}
