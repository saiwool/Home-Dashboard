import 'server-only'
import { allowedOrigin, googleConfigured } from './config.js'
import { GoogleApiError } from './errors.js'
import { colorForCalendar, isWritableRole, sortCalendars } from './calendarChoice.js'
import { WITH_BABY_CALENDAR_ID } from './constants.js'
import { hasRequiredScopes } from './scopes.js'
import { isSchemaError, listCalendars, listConnections, listProfiles } from './store.js'

function profileName(profile) {
  if (!profile) return 'Household member'
  const full = [profile.first_name, profile.last_name].filter(Boolean).join(' ')
  return profile.display_name || full || 'Household member'
}

async function schemaReady(supabase) {
  if (!supabase) return false
  const connection = await supabase.from('google_connections').select('user_id').limit(1)
  if (isSchemaError(connection.error)) return false
  const events = await supabase.from('calendar_events').select('google_calendar_id').limit(1)
  return !isSchemaError(events.error)
}

function calendarDto(calendar) {
  return {
    googleCalendarId: calendar.google_calendar_id,
    name: calendar.summary || 'Calendar',
    color: colorForCalendar(calendar.google_calendar_id, calendar.background_color),
    selected: Boolean(calendar.selected),
    primary: Boolean(calendar.primary_calendar),
    withBaby: calendar.google_calendar_id === WITH_BABY_CALENDAR_ID,
    accessRole: calendar.access_role || '',
    writable: isWritableRole(calendar.access_role),
  }
}

export async function getGoogleStatus(request, supabase, user) {
  const configured = googleConfigured()
  const ready = await schemaReady(supabase)
  const base = {
    configured,
    needsMigration: !ready,
    canConnect: configured && ready && Boolean(allowedOrigin(request)),
    connected: false,
    needsReconnect: false,
    statusError: null,
    email: null,
    lastSyncedAt: null,
    calendars: [],
    household: [],
  }
  if (!configured || !ready || !user) return base

  let connections = []
  let calendars = []
  let profiles = []
  try {
    ;[connections, calendars, profiles] = await Promise.all([
      listConnections({ secrets: false }),
      listCalendars(),
      listProfiles(),
    ])
  } catch (error) {
    if (error instanceof GoogleApiError && error.code === 'needs_migration') {
      return { ...base, needsMigration: true, canConnect: false }
    }
    console.error('google status', error instanceof GoogleApiError ? error.code : 'failed')
    return {
      ...base,
      canConnect: false,
      statusError: 'Could not check Google Calendar. Household events still work.',
    }
  }

  const names = new Map(profiles.map((profile) => [profile.id, profileName(profile)]))
  const byUser = new Map()
  for (const profile of profiles) byUser.set(profile.id, { profile, connection: null })
  for (const connection of connections) {
    const entry = byUser.get(connection.user_id) || { profile: null, connection: null }
    entry.connection = connection
    byUser.set(connection.user_id, entry)
  }

  const household = []
  for (const [userId, entry] of byUser) {
    const connection = entry.connection
    const connected = Boolean(connection)
    const needsReconnect = connected && (
      connection.token_status === 'needs_reconnect' || !hasRequiredScopes(connection.scope)
    )
    const mine = calendars.filter((calendar) => calendar.user_id === userId)
    const you = userId === user.id
    household.push({
      userId,
      name: names.get(userId) || 'Household member',
      you,
      connected,
      needsReconnect,
      email: you ? (connection?.google_email || null) : null,
      lastSyncedAt: you ? (connection?.last_synced_at || null) : null,
      calendars: you
        ? sortCalendars(mine.map(calendarDto))
        : mine.filter((calendar) => calendar.selected).map((calendar) => ({
          name: calendar.summary || 'Calendar',
          color: colorForCalendar(calendar.google_calendar_id, calendar.background_color),
        })),
    })
  }

  household.sort((a, b) => {
    if (a.you !== b.you) return a.you ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  const self = household.find((person) => person.you) || null
  return {
    ...base,
    connected: Boolean(self?.connected),
    needsReconnect: Boolean(self?.needsReconnect),
    email: self?.email || null,
    lastSyncedAt: self?.lastSyncedAt || null,
    calendars: self?.calendars || [],
    household,
  }
}
