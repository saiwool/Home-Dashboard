import 'server-only'
import { addDays, DEFAULT_TZ, getTodayStr, zonedTimeToUtc } from '../dateUtils.js'
import { isMissingColumn, isMissingRelation } from '../dbErrors.js'
import { createServiceClient } from '../supabase/service.js'
import { calendarId } from './config.js'
import { GoogleApiError } from './errors.js'
import { CALENDAR_SCOPE } from './messages.js'
import { decryptSecret, encryptSecret } from './secrets.js'

const PUBLIC_COLUMNS = 'id, connected_by, google_email, calendar_id, token_status, last_synced_at, connected_at'
const SECRET_COLUMNS = `${PUBLIC_COLUMNS}, refresh_token, access_token, access_token_expires_at, scope`

let cachedAccess = null

export function clearCachedAccessToken() {
  cachedAccess = null
}

export function hasCalendarScope(scope) {
  return String(scope || '').split(/\s+/).includes(CALENDAR_SCOPE)
}

async function googleFetch(url, options) {
  try {
    return await fetch(url, {
      ...options,
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    })
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new GoogleApiError('Google Calendar took too long to answer. Try again.', { status: 504, code: 'timeout' })
    }
    throw new GoogleApiError('Could not reach Google Calendar.', { status: 502, code: 'network' })
  }
}

export async function readConnection({ includeSecrets = false } = {}) {
  const service = createServiceClient()
  if (!service) return { connection: null, error: 'not_configured' }
  const { data, error } = await service
    .from('google_calendar_connection')
    .select(includeSecrets ? SECRET_COLUMNS : PUBLIC_COLUMNS)
    .eq('id', 1)
    .maybeSingle()
  if (error) {
    if (isMissingRelation(error) || isMissingColumn(error)) return { connection: null, error: 'missing_table' }
    console.error('google connection read', error.code || '', error.message || '')
    return { connection: null, error: 'read_failed' }
  }
  return { connection: data, error: null }
}

async function markNeedsReconnect() {
  clearCachedAccessToken()
  const service = createServiceClient()
  if (!service) return
  await service.from('google_calendar_connection').update({
    token_status: 'needs_reconnect',
    access_token: null,
    access_token_expires_at: null,
    updated_at: new Date().toISOString(),
  }).eq('id', 1)
}

function reconnectError() {
  return new GoogleApiError('Google Calendar access expired. Reconnect to keep syncing.', {
    status: 409,
    code: 'needs_reconnect',
    needsReconnect: true,
  })
}

export async function getAccessToken(connection, { force = false } = {}) {
  if (!connection) {
    throw new GoogleApiError('Connect Google Calendar first.', { status: 409, code: 'not_connected' })
  }
  if (connection.token_status === 'needs_reconnect') throw reconnectError()

  if (!force && cachedAccess && cachedAccess.expiresAt > Date.now() + 60_000) {
    return cachedAccess.token
  }

  const expiresAt = connection.access_token_expires_at
    ? new Date(connection.access_token_expires_at).getTime()
    : 0
  if (!force && connection.access_token && expiresAt > Date.now() + 60_000) {
    try {
      const token = decryptSecret(connection.access_token)
      cachedAccess = { token, expiresAt }
      return token
    } catch {
      // The client secret changed, or the stored value cannot be decrypted.
    }
  }

  let refreshToken
  try {
    refreshToken = decryptSecret(connection.refresh_token)
  } catch {
    await markNeedsReconnect()
    throw reconnectError()
  }

  const res = await googleFetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.access_token) {
    if (json.error === 'invalid_grant') {
      await markNeedsReconnect()
      throw reconnectError()
    }
    throw new GoogleApiError('Could not refresh Google Calendar access.', { status: 502, code: 'refresh_failed' })
  }

  const nextExpires = Date.now() + (Number(json.expires_in) || 3600) * 1000
  cachedAccess = { token: json.access_token, expiresAt: nextExpires }
  const service = createServiceClient()
  if (service) {
    const update = {
      access_token: encryptSecret(json.access_token),
      access_token_expires_at: new Date(nextExpires).toISOString(),
      token_status: 'active',
      updated_at: new Date().toISOString(),
    }
    if (json.refresh_token) update.refresh_token = encryptSecret(json.refresh_token)
    await service.from('google_calendar_connection').update(update).eq('id', 1)
  }
  return json.access_token
}

export async function requireActiveConnection() {
  const { connection, error } = await readConnection({ includeSecrets: true })
  if (error === 'not_configured') {
    throw new GoogleApiError('Google Calendar is not set up on the server.', { status: 409, code: 'not_configured' })
  }
  if (error === 'missing_table') {
    throw new GoogleApiError('Run the Google Calendar database migration, then try again.', { status: 409, code: 'needs_migration' })
  }
  if (error === 'read_failed') {
    throw new GoogleApiError('Could not read the Google connection.', { status: 500, code: 'read_failed' })
  }
  if (!connection) {
    throw new GoogleApiError('Connect Google Calendar first.', { status: 409, code: 'not_connected' })
  }
  if (connection.token_status === 'needs_reconnect') throw reconnectError()
  return connection
}

function calendarUrl(path) {
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId())}${path}`
}

function withSendUpdates(path, method) {
  if (method === 'GET' || method === 'HEAD') return path
  return path.includes('?') ? `${path}&sendUpdates=none` : `${path}?sendUpdates=none`
}

async function calendarFetch(connection, path, { method = 'GET', body, retryAuth = true } = {}) {
  const token = await getAccessToken(connection, { force: !retryAuth })
  const res = await googleFetch(calendarUrl(withSendUpdates(path, method)), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401 && retryAuth) {
    clearCachedAccessToken()
    return calendarFetch(connection, path, { method, body, retryAuth: false })
  }

  let json = null
  if (res.status !== 204) {
    const text = await res.text()
    if (text) {
      try {
        json = JSON.parse(text)
      } catch {
        json = null
      }
    }
  }
  if (res.ok) return json

  if (res.status === 401) {
    await markNeedsReconnect()
    throw reconnectError()
  }
  if (res.status === 429) {
    throw new GoogleApiError('Google Calendar is busy. Wait a moment and try again.', { status: 429, code: 'rate_limit' })
  }
  if (res.status === 403) {
    throw new GoogleApiError(
      'That Google account cannot change this calendar. Share it with permission to make changes to events, then try again.',
      { status: 403, code: 'forbidden' }
    )
  }
  if (res.status === 404) {
    const listing = method === 'GET'
    throw new GoogleApiError(
      listing
        ? 'Cannot open that Google calendar. Check the calendar id and that the connected account can edit it.'
        : 'That event is no longer on Google Calendar.',
      { status: 404, code: listing ? 'calendar_not_found' : 'not_found' }
    )
  }
  const message = json?.error?.message || 'Google Calendar rejected that change.'
  const status = res.status >= 400 && res.status < 500 ? res.status : 502
  throw new GoogleApiError(message, { status, code: 'google_error' })
}

export async function listGoogleEvents(connection) {
  const today = getTodayStr(DEFAULT_TZ)
  const timeMinDate = addDays(today, -400)
  const timeMaxDate = addDays(today, 800)
  const timeMin = zonedTimeToUtc(timeMinDate, '00:00', DEFAULT_TZ)
  const timeMax = zonedTimeToUtc(timeMaxDate, '00:00', DEFAULT_TZ)
  const events = []
  let pageToken = ''

  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      showDeleted: 'false',
      maxResults: '250',
      timeMin,
      timeMax,
    })
    if (pageToken) params.set('pageToken', pageToken)
    const json = await calendarFetch(connection, `/events?${params}`)
    events.push(...(json?.items || []))
    if (!json?.nextPageToken) {
      return { events, timeMinDate, timeMaxDate, truncated: false }
    }
    pageToken = json.nextPageToken
  }

  return { events, timeMinDate, timeMaxDate, truncated: true }
}

export function createGoogleEvent(connection, body) {
  return calendarFetch(connection, '/events', { method: 'POST', body })
}

export function updateGoogleEvent(connection, eventId, body) {
  return calendarFetch(connection, `/events/${encodeURIComponent(eventId)}`, { method: 'PATCH', body })
}

export async function deleteGoogleEvent(connection, eventId) {
  try {
    await calendarFetch(connection, `/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' })
  } catch (error) {
    if (error instanceof GoogleApiError && error.code === 'not_found') return
    throw error
  }
}

export function emailFromIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') return null
  const parts = idToken.split('.')
  if (parts.length < 2) return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
    if (!audiences.includes(process.env.GOOGLE_CLIENT_ID)) return null
    if (payload.email_verified === false) return null
    return typeof payload.email === 'string' ? payload.email : null
  } catch {
    return null
  }
}

export async function emailFromAccessToken(accessToken) {
  const res = await googleFetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  const json = await res.json().catch(() => ({}))
  return typeof json.email === 'string' ? json.email : null
}

export async function exchangeAuthCode(code, redirectUri) {
  const res = await googleFetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const codeName = typeof json.error === 'string' ? json.error : 'exchange'
    throw new GoogleApiError('Could not finish connecting Google Calendar.', { status: 400, code: codeName })
  }
  return json
}

export async function saveConnection({ userId, email, refreshToken, accessToken, expiresIn, scope }) {
  const service = createServiceClient()
  if (!service) {
    throw new GoogleApiError('The server is missing the database key for Google Calendar.', { status: 500, code: 'not_configured' })
  }
  clearCachedAccessToken()
  const expiresAt = new Date(Date.now() + (Number(expiresIn) || 3600) * 1000).toISOString()
  const { error } = await service.from('google_calendar_connection').upsert({
    id: 1,
    connected_by: userId,
    google_email: email,
    refresh_token: encryptSecret(refreshToken),
    access_token: encryptSecret(accessToken),
    access_token_expires_at: expiresAt,
    calendar_id: calendarId(),
    scope: scope || null,
    token_status: 'active',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) {
    if (isMissingRelation(error) || isMissingColumn(error)) {
      throw new GoogleApiError('Run the Google Calendar database migration, then connect again.', { status: 409, code: 'needs_migration' })
    }
    console.error('google connection save', error.code || '', error.message || '')
    throw new GoogleApiError('Could not store the Google connection.', { status: 500, code: 'save_failed' })
  }
  cachedAccess = { token: accessToken, expiresAt: new Date(expiresAt).getTime() }
}

export async function deleteConnection() {
  clearCachedAccessToken()
  const service = createServiceClient()
  if (!service) {
    throw new GoogleApiError('The server is missing the database key for Google Calendar.', { status: 500, code: 'not_configured' })
  }
  const { error } = await service.from('google_calendar_connection').delete().eq('id', 1)
  if (error && !isMissingRelation(error)) {
    console.error('google disconnect', error.code || '', error.message || '')
    throw new GoogleApiError('Could not disconnect Google Calendar.', { status: 500, code: 'disconnect_failed' })
  }
}
