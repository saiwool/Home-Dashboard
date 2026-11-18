import 'server-only'
import { isMissingColumn, isMissingRelation } from '../dbErrors.js'
import { createServiceClient } from '../supabase/service.js'
import { missingGoogleEnv } from './config.js'
import {
  createGoogleEvent,
  deleteGoogleEvent,
  listGoogleEvents,
  readConnection,
  requireActiveConnection,
  updateGoogleEvent,
} from './client.js'
import { GoogleApiError } from './errors.js'
import { eventRowToInput, fromGoogleEvent, toGoogleEventBody } from './mapEvent.js'

const RECENT_MS = 5000

function serviceOrThrow() {
  const service = createServiceClient()
  if (!service) {
    throw new GoogleApiError('Google Calendar is not set up on the server.', { status: 409, code: 'not_configured' })
  }
  return service
}

async function chunked(items, size, fn) {
  if (!items.length) return
  for (let i = 0; i < items.length; i += size) {
    const { error } = await fn(items.slice(i, i + size))
    if (!error) continue
    if (isMissingColumn(error) || isMissingRelation(error)) {
      throw new GoogleApiError('Run the Google Calendar database migration, then try again.', { status: 409, code: 'needs_migration' })
    }
    console.error('google calendar save', error.code || '', error.message || '')
    throw new GoogleApiError('Could not save Google events to the dashboard.', { status: 500, code: 'save_failed' })
  }
}

async function mapPool(items, limit, fn) {
  const results = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await fn(items[index])
    }
  }
  const workers = Math.min(limit, items.length)
  if (!workers) return results
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return results
}

export async function syncFromGoogle(userId, { force = false } = {}) {
  if (missingGoogleEnv().length) return { skipped: 'not_configured' }
  const service = createServiceClient()
  if (!service) return { skipped: 'not_configured' }

  const { connection, error } = await readConnection({ includeSecrets: true })
  if (error === 'missing_table') return { skipped: 'needs_migration' }
  if (error === 'read_failed') {
    throw new GoogleApiError('Could not read the Google connection.', { status: 500, code: 'read_failed' })
  }
  if (!connection) return { skipped: 'not_connected' }
  if (connection.token_status === 'needs_reconnect') return { skipped: 'needs_reconnect' }

  if (!force && connection.last_synced_at) {
    const age = Date.now() - new Date(connection.last_synced_at).getTime()
    if (age >= 0 && age < RECENT_MS) return { skipped: 'recent' }
  }

  const { events, timeMinDate, timeMaxDate, truncated } = await listGoogleEvents(connection)
  const { data: existing, error: existingError } = await service
    .from('calendar_events')
    .select('id, created_by, google_event_id, start_date')

  if (existingError) {
    if (isMissingColumn(existingError) || isMissingRelation(existingError)) return { skipped: 'needs_migration' }
    console.error('google calendar read', existingError.code || '', existingError.message || '')
    throw new GoogleApiError('Could not read dashboard events.', { status: 500, code: 'read_failed' })
  }

  const rows = existing || []
  const byGoogleId = new Map()
  const byId = new Map()
  for (const row of rows) {
    byId.set(row.id, row)
    if (row.google_event_id) byGoogleId.set(row.google_event_id, row)
  }

  const seen = new Set()
  const updates = []
  const inserts = []

  for (const googleEvent of events) {
    if (!googleEvent?.id || googleEvent.status === 'cancelled') continue
    const mapped = fromGoogleEvent(googleEvent)
    if (!mapped || seen.has(googleEvent.id)) continue
    seen.add(googleEvent.id)

    const dashboardId = googleEvent.extendedProperties?.private?.dashboardId
    let linked = byGoogleId.get(googleEvent.id) || null
    if (!linked && dashboardId) {
      const candidate = byId.get(dashboardId)
      if (candidate && (!candidate.google_event_id || candidate.google_event_id === googleEvent.id)) {
        linked = candidate
      }
    }

    if (linked) {
      updates.push({
        id: linked.id,
        created_by: linked.created_by,
        google_event_id: googleEvent.id,
        ...mapped,
      })
      byGoogleId.set(googleEvent.id, linked)
    } else {
      inserts.push({
        created_by: userId,
        google_event_id: googleEvent.id,
        ...mapped,
      })
    }
  }

  const updateById = new Map()
  for (const row of updates) updateById.set(row.id, row)
  await chunked([...updateById.values()], 100, (slice) => (
    service.from('calendar_events').upsert(slice, { onConflict: 'id' })
  ))

  for (let i = 0; i < inserts.length; i += 100) {
    const slice = inserts.slice(i, i + 100)
    const { error: insertError } = await service.from('calendar_events').insert(slice)
    if (!insertError) continue
    if (insertError.code !== '23505') {
      if (isMissingColumn(insertError) || isMissingRelation(insertError)) {
        return { skipped: 'needs_migration' }
      }
      console.error('google calendar insert', insertError.code || '', insertError.message || '')
      throw new GoogleApiError('Could not save Google events to the dashboard.', { status: 500, code: 'save_failed' })
    }
    for (const row of slice) {
      const { error: oneError } = await service.from('calendar_events').insert(row)
      if (oneError && oneError.code !== '23505') {
        console.error('google calendar insert', oneError.code || '', oneError.message || '')
        throw new GoogleApiError('Could not save Google events to the dashboard.', { status: 500, code: 'save_failed' })
      }
    }
  }

  let removed = 0
  if (!truncated) {
    const stale = rows.filter((row) => {
      if (!row.google_event_id || seen.has(row.google_event_id)) return false
      if (!row.start_date) return false
      return row.start_date >= timeMinDate && row.start_date <= timeMaxDate
    }).map((row) => row.id)
    removed = stale.length
    await chunked(stale, 100, (slice) => service.from('calendar_events').delete().in('id', slice))
  }

  await service.from('google_calendar_connection').update({
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', 1)

  return { skipped: null, upserted: updateById.size + inserts.length, removed }
}

function storedFields(input, mapped) {
  if (mapped?.title && mapped.start_date) return mapped
  return {
    title: input.title,
    description: input.description || null,
    all_day: Boolean(input.allDay),
    start_date: input.startDate,
    end_date: input.endDate || input.startDate,
    start_time: input.allDay ? null : input.startIso || null,
    end_time: input.allDay ? null : input.endIso || null,
  }
}

export async function importLocalEvents(userId) {
  const connection = await requireActiveConnection()
  const service = serviceOrThrow()
  const { count, error: countError } = await service
    .from('calendar_events')
    .select('id', { count: 'exact', head: true })
    .is('google_event_id', null)
  if (countError) {
    if (isMissingColumn(countError) || isMissingRelation(countError)) {
      throw new GoogleApiError('Run the Google Calendar database migration, then try again.', { status: 409, code: 'needs_migration' })
    }
    throw new GoogleApiError('Could not read dashboard events.', { status: 500, code: 'read_failed' })
  }

  const { data: rows, error } = await service
    .from('calendar_events')
    .select('*')
    .is('google_event_id', null)
    .order('start_date', { ascending: true })
    .limit(500)
  if (error) {
    throw new GoogleApiError('Could not read dashboard events.', { status: 500, code: 'read_failed' })
  }

  const list = rows || []
  const { events } = list.length ? await listGoogleEvents(connection) : { events: [] }
  const byDashboard = new Map()
  for (const googleEvent of events) {
    const dashboardId = googleEvent?.extendedProperties?.private?.dashboardId
    if (dashboardId && googleEvent.id && googleEvent.status !== 'cancelled') {
      byDashboard.set(dashboardId, googleEvent)
    }
  }

  const results = await mapPool(list, 4, async (row) => {
    try {
      const known = byDashboard.get(row.id)
      if (known) {
        const mapped = fromGoogleEvent(known) || {}
        const { data: linked, error: linkError } = await service
          .from('calendar_events')
          .update({ google_event_id: known.id, ...mapped })
          .eq('id', row.id)
          .is('google_event_id', null)
          .select('id')
        if (linkError) return { ok: false, title: row.title, message: 'Could not save the Google link.' }
        if (!linked?.length) return { ok: true }
        return { ok: true }
      }

      const created = await createGoogleEvent(connection, toGoogleEventBody(eventRowToInput(row)))
      const mapped = fromGoogleEvent(created) || {}
      const { data: updated, error: updateError } = await service
        .from('calendar_events')
        .update({ google_event_id: created.id, ...mapped })
        .eq('id', row.id)
        .is('google_event_id', null)
        .select('id')
      if (updateError || !updated?.length) {
        await deleteGoogleEvent(connection, created.id).catch(() => {})
        if (!updateError && !updated?.length) return { ok: true }
        return { ok: false, title: row.title, message: 'Could not save the Google link.' }
      }
      return { ok: true }
    } catch (err) {
      return { ok: false, title: row.title, message: err?.message || 'Could not import this event.' }
    }
  })

  const failed = results.filter((result) => result && !result.ok)
  await syncFromGoogle(userId, { force: true }).catch(() => {})
  return {
    imported: results.length - failed.length,
    failed: failed.slice(0, 8).map((result) => ({ title: result.title, message: result.message })),
    failedCount: failed.length,
    capped: (count || 0) > list.length,
  }
}

export async function createLinkedEvent(userId, input) {
  const connection = await requireActiveConnection()
  const service = serviceOrThrow()
  const id = crypto.randomUUID()
  const created = await createGoogleEvent(connection, toGoogleEventBody({ ...input, dashboardId: id }))
  if (!created?.id) {
    throw new GoogleApiError('Google Calendar did not save that event.', { status: 502, code: 'google_error' })
  }
  const mapped = storedFields(input, fromGoogleEvent(created))
  const { data, error } = await service.from('calendar_events').insert({
    id,
    created_by: userId,
    google_event_id: created.id,
    ...mapped,
  }).select('*').single()
  if (error || !data) {
    await deleteGoogleEvent(connection, created.id).catch(() => {})
    if (error) console.error('google event insert', error.code || '', error.message || '')
    throw new GoogleApiError('Could not save the event in the dashboard.', { status: 500, code: 'save_failed' })
  }
  return data
}

export async function updateLinkedEvent(id, input) {
  const connection = await requireActiveConnection()
  const service = serviceOrThrow()
  const { data: row, error } = await service.from('calendar_events').select('*').eq('id', id).maybeSingle()
  if (error) {
    if (isMissingColumn(error) || isMissingRelation(error)) {
      throw new GoogleApiError('Run the Google Calendar database migration, then try again.', { status: 409, code: 'needs_migration' })
    }
    throw new GoogleApiError('Could not read that event.', { status: 500, code: 'read_failed' })
  }
  if (!row) throw new GoogleApiError('Event not found.', { status: 404, code: 'not_found' })

  const body = toGoogleEventBody({ ...input, dashboardId: id })
  let googleEvent
  if (row.google_event_id) {
    try {
      googleEvent = await updateGoogleEvent(connection, row.google_event_id, body)
    } catch (err) {
      if (!(err instanceof GoogleApiError) || err.code !== 'not_found') throw err
      googleEvent = await createGoogleEvent(connection, body)
    }
  } else {
    googleEvent = await createGoogleEvent(connection, body)
  }
  if (!googleEvent?.id) {
    throw new GoogleApiError('Google Calendar did not save that event.', { status: 502, code: 'google_error' })
  }

  const mapped = storedFields(input, fromGoogleEvent(googleEvent))
  const { data, error: updateError } = await service.from('calendar_events').update({
    ...mapped,
    google_event_id: googleEvent.id,
  }).eq('id', id).select('*').single()
  if (updateError || !data) {
    throw new GoogleApiError('Updated Google Calendar, but the dashboard copy did not save. Refresh to pull it back.', { status: 500, code: 'save_failed' })
  }
  return data
}

export async function deleteLinkedEvent(id) {
  const connection = await requireActiveConnection()
  const service = serviceOrThrow()
  const { data: row, error } = await service.from('calendar_events').select('id, google_event_id').eq('id', id).maybeSingle()
  if (error) throw new GoogleApiError('Could not read that event.', { status: 500, code: 'read_failed' })
  if (!row) throw new GoogleApiError('Event not found.', { status: 404, code: 'not_found' })
  if (row.google_event_id) await deleteGoogleEvent(connection, row.google_event_id)
  const { error: deleteError } = await service.from('calendar_events').delete().eq('id', id)
  if (deleteError) {
    throw new GoogleApiError('Removed the Google event, but it is still in the dashboard. Refresh and try again.', { status: 500, code: 'save_failed' })
  }
}
