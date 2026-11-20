import 'server-only'
import { addDays, DEFAULT_TZ, getTodayStr, zonedTimeToUtc } from '../dateUtils.js'
import { SYNC_FUTURE_DAYS, SYNC_PAST_DAYS } from './constants.js'
import { GoogleApiError } from './errors.js'
import {
  decryptOrNull,
  encryptOrThrow,
  getConnection,
  markConnectionReconnect,
  updateConnectionTokens,
  upsertConnection,
} from './store.js'

const cachedAccess = new Map()

export function clearCachedAccessToken(userId) {
  if (userId) cachedAccess.delete(userId)
  else cachedAccess.clear()
}

function reconnectError() {
  return new GoogleApiError('Google needs you to connect again before Home can update that calendar.', {
    status: 409,
    code: 'needs_reconnect',
    needsReconnect: true,
  })
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
    throw new GoogleApiError('Could not reach Google Calendar. Try again.', { status: 502, code: 'network' })
  }
}

async function readJson(res) {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export async function getAccessToken(connection, { force = false } = {}) {
  if (!connection?.user_id) {
    throw new GoogleApiError('Connect your Google account first.', { status: 409, code: 'not_connected' })
  }
  if (connection.token_status === 'needs_reconnect') throw reconnectError()

  const cached = cachedAccess.get(connection.user_id)
  if (!force && cached && cached.expiresAt > Date.now() + 60_000) return cached.token

  const expiresAt = connection.access_token_expires_at
    ? new Date(connection.access_token_expires_at).getTime()
    : 0
  if (!force && connection.access_token && expiresAt > Date.now() + 60_000) {
    const token = decryptOrNull(connection.access_token)
    if (token) {
      cachedAccess.set(connection.user_id, { token, expiresAt })
      return token
    }
  }

  const refreshToken = decryptOrNull(connection.refresh_token)
  if (!refreshToken) {
    clearCachedAccessToken(connection.user_id)
    await markConnectionReconnect(connection.user_id)
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
  const json = await readJson(res)
  if (!res.ok || !json?.access_token) {
    if (json?.error === 'invalid_grant') {
      clearCachedAccessToken(connection.user_id)
      await markConnectionReconnect(connection.user_id)
      throw reconnectError()
    }
    console.error('google token refresh', res.status)
    throw new GoogleApiError('Could not refresh Google Calendar. Try again.', { status: 502, code: 'refresh_failed' })
  }

  const nextExpires = Date.now() + (Number(json.expires_in) || 3600) * 1000
  cachedAccess.set(connection.user_id, { token: json.access_token, expiresAt: nextExpires })
  const update = {
    access_token: encryptOrThrow(json.access_token),
    access_token_expires_at: new Date(nextExpires).toISOString(),
    token_status: 'active',
  }
  if (json.refresh_token) update.refresh_token = encryptOrThrow(json.refresh_token)
  await updateConnectionTokens(connection.user_id, update)
  connection.access_token = update.access_token
  connection.access_token_expires_at = update.access_token_expires_at
  connection.token_status = 'active'
  if (update.refresh_token) connection.refresh_token = update.refresh_token
  return json.access_token
}

function withSendUpdates(url, method) {
  if (method === 'GET' || method === 'HEAD') return url
  const next = new URL(url)
  next.searchParams.set('sendUpdates', 'none')
  return next.toString()
}

async function authorizedFetch(connection, url, { method = 'GET', body, retryAuth = true } = {}) {
  const token = await getAccessToken(connection, { force: !retryAuth })
  const res = await googleFetch(withSendUpdates(url, method), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401 && retryAuth) {
    clearCachedAccessToken(connection.user_id)
    return authorizedFetch(connection, url, { method, body, retryAuth: false })
  }
  const json = res.status === 204 ? null : await readJson(res)
  if (res.ok) return json
  if (res.status === 401) {
    clearCachedAccessToken(connection.user_id)
    await markConnectionReconnect(connection.user_id)
    throw reconnectError()
  }
  if (res.status === 429) {
    throw new GoogleApiError('Google Calendar is busy. Wait a moment and try again.', { status: 429, code: 'rate_limit' })
  }
  if (res.status === 403) {
    throw new GoogleApiError('Google did not allow that change on this calendar.', { status: 403, code: 'forbidden' })
  }
  if (res.status === 404) {
    throw new GoogleApiError(
      method === 'GET' ? 'Home could not open that Google calendar.' : 'That event is no longer on Google Calendar.',
      { status: 404, code: method === 'GET' ? 'calendar_not_found' : 'not_found' }
    )
  }
  console.error('google calendar api', res.status)
  throw new GoogleApiError('Google Calendar could not complete that. Try again.', {
    status: res.status >= 400 && res.status < 500 ? res.status : 502,
    code: 'google_error',
  })
}

function calendarUrl(calendarId, pathAndQuery) {
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}${pathAndQuery}`
}

export function syncWindow() {
  const today = getTodayStr(DEFAULT_TZ)
  const windowStart = addDays(today, -SYNC_PAST_DAYS)
  const windowEnd = addDays(today, SYNC_FUTURE_DAYS)
  return {
    windowStart,
    windowEnd,
    timeMin: zonedTimeToUtc(windowStart, '00:00', DEFAULT_TZ),
    timeMax: zonedTimeToUtc(addDays(windowEnd, 1), '00:00', DEFAULT_TZ),
  }
}

export async function listGoogleCalendars(connection) {
  const calendars = []
  let pageToken = ''
  for (let page = 0; page < 10; page += 1) {
    const params = new URLSearchParams({
      maxResults: '250',
      showHidden: 'true',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const json = await authorizedFetch(
      connection,
      `https://www.googleapis.com/calendar/v3/users/me/calendarList?${params}`
    )
    calendars.push(...(json?.items || []))
    if (!json?.nextPageToken) break
    pageToken = json.nextPageToken
  }
  return calendars.filter((calendar) => calendar?.id)
}

export async function listGoogleEvents(connection, calendarId, window) {
  const events = []
  let pageToken = ''
  let truncated = false
  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      showDeleted: 'false',
      maxResults: '250',
      timeMin: window.timeMin,
      timeMax: window.timeMax,
    })
    if (pageToken) params.set('pageToken', pageToken)
    const json = await authorizedFetch(connection, `${calendarUrl(calendarId, '/events')}?${params}`)
    events.push(...(json?.items || []))
    if (!json?.nextPageToken) return { events, truncated }
    if (page === 19) {
      truncated = true
      break
    }
    pageToken = json.nextPageToken
  }
  return { events, truncated }
}

export function createGoogleEvent(connection, calendarId, body) {
  return authorizedFetch(connection, calendarUrl(calendarId, '/events'), { method: 'POST', body })
}

export function updateGoogleEvent(connection, calendarId, eventId, body) {
  return authorizedFetch(
    connection,
    calendarUrl(calendarId, `/events/${encodeURIComponent(eventId)}`),
    { method: 'PATCH', body }
  )
}

export async function deleteGoogleEvent(connection, calendarId, eventId) {
  try {
    await authorizedFetch(
      connection,
      calendarUrl(calendarId, `/events/${encodeURIComponent(eventId)}`),
      { method: 'DELETE' }
    )
  } catch (error) {
    if (error instanceof GoogleApiError && error.code === 'not_found') return
    throw error
  }
}

export async function findGoogleEventByDashboardId(connection, calendarId, dashboardId) {
  const params = new URLSearchParams({
    privateExtendedProperty: `dashboardId=${dashboardId}`,
    singleEvents: 'true',
    maxResults: '2',
    showDeleted: 'false',
  })
  const json = await authorizedFetch(connection, `${calendarUrl(calendarId, '/events')}?${params}`)
  return (json?.items || []).find((event) => event?.id && event.status !== 'cancelled') || null
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
  const json = await readJson(res)
  return typeof json?.email === 'string' ? json.email : null
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
  const json = await readJson(res)
  if (!res.ok) {
    const codeName = typeof json?.error === 'string' ? json.error : 'exchange'
    console.error('google oauth exchange', codeName)
    throw new GoogleApiError('Could not finish connecting Google.', { status: 400, code: codeName })
  }
  return json || {}
}

export async function saveConnection({ userId, email, refreshToken, accessToken, expiresIn, scope }) {
  let refresh = refreshToken
  if (!refresh) {
    const existing = await getConnection(userId, { secrets: true })
    refresh = existing?.refresh_token ? decryptOrNull(existing.refresh_token) : null
  }
  if (!refresh) {
    throw new GoogleApiError('Google did not allow Home to keep the connection. Try again and accept the prompt.', {
      status: 400,
      code: 'no_refresh',
    })
  }
  clearCachedAccessToken(userId)
  const expiresAt = new Date(Date.now() + (Number(expiresIn) || 3600) * 1000).toISOString()
  await upsertConnection({
    user_id: userId,
    google_email: email,
    refresh_token: encryptOrThrow(refresh),
    access_token: accessToken ? encryptOrThrow(accessToken) : null,
    access_token_expires_at: expiresAt,
    scope: scope || null,
    token_status: 'active',
    updated_at: new Date().toISOString(),
  })
  if (accessToken) cachedAccess.set(userId, { token: accessToken, expiresAt: new Date(expiresAt).getTime() })
}

export async function requireActiveConnection(userId) {
  const connection = await getConnection(userId, { secrets: true })
  if (!connection) {
    throw new GoogleApiError('Connect your Google account first.', { status: 409, code: 'not_connected' })
  }
  if (connection.token_status === 'needs_reconnect') throw reconnectError()
  return connection
}
