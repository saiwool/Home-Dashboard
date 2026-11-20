import 'server-only'
import { isMissingColumn, isMissingRelation } from '../dbErrors.js'
import { createServiceClient } from '../supabase/service.js'
import { GoogleApiError } from './errors.js'
import { decryptSecret, encryptSecret } from './secrets.js'

const PUBLIC_CONNECTION = 'user_id, google_email, scope, token_status, last_synced_at, connected_at, updated_at'
const SECRET_CONNECTION = `${PUBLIC_CONNECTION}, refresh_token, access_token, access_token_expires_at`

const EVENT_SYNC_COLUMNS = 'id, created_by, origin, google_calendar_id, google_event_id, start_date'

function migrationError() {
  return new GoogleApiError(
    'The household database needs a one-time calendar update before Google can connect.',
    { status: 409, code: 'needs_migration' }
  )
}

function notConfigured() {
  return new GoogleApiError(
    'Google Calendar is not turned on for Home yet. Household events still work.',
    { status: 409, code: 'not_configured' }
  )
}

export function isSchemaError(error) {
  return isMissingRelation(error) || isMissingColumn(error)
}

function assertNoError(error, fallback) {
  if (!error) return
  if (isSchemaError(error)) throw migrationError()
  console.error('google calendar store', error.code || 'unknown')
  throw fallback
}

export function requireService() {
  const service = createServiceClient()
  if (!service) throw notConfigured()
  return service
}

function encryptOrThrow(value) {
  try {
    return encryptSecret(value)
  } catch {
    throw notConfigured()
  }
}

export function decryptOrNull(payload) {
  try {
    return decryptSecret(payload)
  } catch {
    return null
  }
}

export async function getConnection(userId, { secrets = false } = {}) {
  const service = requireService()
  const { data, error } = await service
    .from('google_connections')
    .select(secrets ? SECRET_CONNECTION : PUBLIC_CONNECTION)
    .eq('user_id', userId)
    .maybeSingle()
  assertNoError(error, new GoogleApiError('Could not read the Google connection.', { status: 500, code: 'read_failed' }))
  return data
}

export async function listConnections({ secrets = false } = {}) {
  const service = requireService()
  const { data, error } = await service
    .from('google_connections')
    .select(secrets ? SECRET_CONNECTION : PUBLIC_CONNECTION)
  assertNoError(error, new GoogleApiError('Could not read Google connections.', { status: 500, code: 'read_failed' }))
  return data || []
}

export async function upsertConnection(row) {
  const service = requireService()
  const { error } = await service.from('google_connections').upsert(row, { onConflict: 'user_id' })
  assertNoError(error, new GoogleApiError('Could not save the Google connection.', { status: 500, code: 'save_failed' }))
}

export async function markConnectionReconnect(userId) {
  const service = createServiceClient()
  if (!service) return
  await service.from('google_connections').update({
    token_status: 'needs_reconnect',
    access_token: null,
    access_token_expires_at: null,
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId)
}

export async function updateConnectionTokens(userId, fields) {
  const service = requireService()
  const { error } = await service.from('google_connections').update({
    ...fields,
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId)
  assertNoError(error, new GoogleApiError('Could not refresh the Google connection.', { status: 500, code: 'save_failed' }))
}

export async function touchConnections(userIds, when = new Date().toISOString()) {
  if (!userIds.length) return
  const service = requireService()
  const { error } = await service.from('google_connections').update({
    last_synced_at: when,
    updated_at: when,
  }).in('user_id', userIds)
  if (error && !isSchemaError(error)) console.error('google calendar touch', error.code || 'unknown')
}

export async function deleteConnection(userId) {
  const service = requireService()
  const { error } = await service.from('google_connections').delete().eq('user_id', userId)
  assertNoError(error, new GoogleApiError('Could not disconnect Google.', { status: 500, code: 'disconnect_failed' }))
}

export async function listCalendars() {
  const service = requireService()
  const { data, error } = await service
    .from('google_calendars')
    .select('id, user_id, google_calendar_id, summary, description, background_color, foreground_color, access_role, primary_calendar, selected, updated_at')
  assertNoError(error, new GoogleApiError('Could not read calendars.', { status: 500, code: 'read_failed' }))
  return data || []
}

export async function replaceUserCalendars(userId, remoteCalendars, suggestSelected) {
  const service = requireService()
  const { data: existing, error: readError } = await service
    .from('google_calendars')
    .select('google_calendar_id, selected')
    .eq('user_id', userId)
  assertNoError(readError, new GoogleApiError('Could not read calendars.', { status: 500, code: 'read_failed' }))

  const selectedById = new Map((existing || []).map((row) => [row.google_calendar_id, row.selected]))
  const now = new Date().toISOString()
  const rows = []
  const seen = new Set()
  for (const calendar of remoteCalendars) {
    if (!calendar?.id || seen.has(calendar.id)) continue
    seen.add(calendar.id)
    const known = selectedById.has(calendar.id)
    rows.push({
      user_id: userId,
      google_calendar_id: calendar.id,
      summary: String(calendar.summary || 'Calendar').slice(0, 200),
      description: calendar.description ? String(calendar.description).slice(0, 500) : null,
      background_color: calendar.backgroundColor || null,
      foreground_color: calendar.foregroundColor || null,
      access_role: calendar.accessRole || null,
      primary_calendar: Boolean(calendar.primary),
      selected: known ? Boolean(selectedById.get(calendar.id)) : Boolean(suggestSelected(calendar)),
      updated_at: now,
    })
  }

  if (rows.length) {
    const { error } = await service.from('google_calendars').upsert(rows, { onConflict: 'user_id,google_calendar_id' })
    assertNoError(error, new GoogleApiError('Could not save the calendar list.', { status: 500, code: 'save_failed' }))
  }

  const stale = (existing || []).map((row) => row.google_calendar_id).filter((id) => !seen.has(id))
  if (stale.length) {
    const { error } = await service
      .from('google_calendars')
      .delete()
      .eq('user_id', userId)
      .in('google_calendar_id', stale)
    assertNoError(error, new GoogleApiError('Could not update the calendar list.', { status: 500, code: 'save_failed' }))
  }

  const { data, error } = await service
    .from('google_calendars')
    .select('id, user_id, google_calendar_id, summary, background_color, foreground_color, access_role, primary_calendar, selected')
    .eq('user_id', userId)
  assertNoError(error, new GoogleApiError('Could not read calendars.', { status: 500, code: 'read_failed' }))
  return data || []
}

export async function setCalendarSelected(userId, googleCalendarId, selected) {
  const service = requireService()
  const { data, error } = await service
    .from('google_calendars')
    .update({ selected: Boolean(selected), updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('google_calendar_id', googleCalendarId)
    .select('google_calendar_id, summary, access_role, selected')
  assertNoError(error, new GoogleApiError('Could not update that calendar.', { status: 500, code: 'save_failed' }))
  if (!data?.length) {
    throw new GoogleApiError('That calendar is not on your Google account.', { status: 404, code: 'calendar' })
  }
  return data[0]
}

export async function listSyncEventRows() {
  const service = requireService()
  const { data, error } = await service.from('calendar_events').select(EVENT_SYNC_COLUMNS)
  assertNoError(error, new GoogleApiError('Could not read household events.', { status: 500, code: 'read_failed' }))
  return data || []
}

async function chunk(items, size, fn) {
  for (let i = 0; i < items.length; i += size) {
    const error = await fn(items.slice(i, i + size))
    if (error) return error
  }
  return null
}

async function saveSyncRow(service, row) {
  const { error } = await service.from('calendar_events').upsert(row, { onConflict: 'id' })
  if (!error) return
  if (error.code !== '23505') {
    assertNoError(error, new GoogleApiError('Could not save Google events.', { status: 500, code: 'save_failed' }))
  }
  const { id, created_by, ...patch } = row
  void id
  void created_by
  const { error: updateError } = await service
    .from('calendar_events')
    .update(patch)
    .eq('google_calendar_id', row.google_calendar_id)
    .eq('google_event_id', row.google_event_id)
  assertNoError(updateError, new GoogleApiError('Could not save Google events.', { status: 500, code: 'save_failed' }))
}

export async function applySyncPlan({ upserts, deleteIds }) {
  const service = requireService()
  const error = await chunk(upserts, 50, async (slice) => {
    const { error: upsertError } = await service.from('calendar_events').upsert(slice, { onConflict: 'id' })
    return upsertError
  })
  if (error?.code === '23505') {
    for (const row of upserts) await saveSyncRow(service, row)
  } else {
    assertNoError(error, new GoogleApiError('Could not save Google events.', { status: 500, code: 'save_failed' }))
  }

  const deleteError = await chunk(deleteIds, 100, async (slice) => {
    const { error: removeError } = await service.from('calendar_events').delete().in('id', slice)
    return removeError
  })
  assertNoError(deleteError, new GoogleApiError('Could not update household events.', { status: 500, code: 'save_failed' }))
}

export async function getEvent(id) {
  const service = requireService()
  const { data, error } = await service.from('calendar_events').select('*').eq('id', id).maybeSingle()
  assertNoError(error, new GoogleApiError('Could not read that event.', { status: 500, code: 'read_failed' }))
  return data
}

export async function insertEvent(row) {
  const service = requireService()
  const { data, error } = await service.from('calendar_events').insert(row).select('*').single()
  assertNoError(error, new GoogleApiError('Could not save the event.', { status: 500, code: 'save_failed' }))
  return data
}

export async function updateEvent(id, patch) {
  const service = requireService()
  const { data, error } = await service.from('calendar_events').update(patch).eq('id', id).select('*').single()
  assertNoError(error, new GoogleApiError('Could not save the event.', { status: 500, code: 'save_failed' }))
  return data
}

export async function deleteEvent(id) {
  const service = requireService()
  const { error } = await service.from('calendar_events').delete().eq('id', id)
  assertNoError(error, new GoogleApiError('Could not delete the event.', { status: 500, code: 'save_failed' }))
}

export async function listUnlinkedEvents(limit = 200) {
  const service = requireService()
  const { count, error: countError } = await service
    .from('calendar_events')
    .select('id', { count: 'exact', head: true })
    .is('google_event_id', null)
  assertNoError(countError, new GoogleApiError('Could not read household events.', { status: 500, code: 'read_failed' }))
  const { data, error } = await service
    .from('calendar_events')
    .select('*')
    .is('google_event_id', null)
    .order('start_date', { ascending: true })
    .limit(limit)
  assertNoError(error, new GoogleApiError('Could not read household events.', { status: 500, code: 'read_failed' }))
  return { rows: data || [], total: count || 0 }
}

export async function listProfiles() {
  const service = requireService()
  const { data, error } = await service
    .from('profiles')
    .select('id, display_name, first_name, last_name')
  if (error) {
    console.error('google calendar profiles', error.code || 'unknown')
    return []
  }
  return data || []
}

export { encryptOrThrow }
