import 'server-only'
import { isMissingColumn, isMissingRelation } from '../dbErrors.js'
import { allowedOrigin, calendarLabel, missingGoogleEnv } from './config.js'
import { readConnection } from './client.js'

export async function getGoogleStatus(request, supabase) {
  const missing = missingGoogleEnv()
  const configured = missing.length === 0
  const originAllowed = Boolean(allowedOrigin(request))

  let schemaReady = true
  if (supabase) {
    const { error } = await supabase.from('calendar_events').select('google_event_id').limit(1)
    schemaReady = !isMissingColumn(error) && !isMissingRelation(error)
  }

  const base = {
    configured,
    connected: false,
    needsMigration: !schemaReady,
    needsReconnect: false,
    canConnect: configured && originAllowed && schemaReady,
    schemaReady,
    email: null,
    calendarLabel: calendarLabel(),
    missing,
    statusError: null,
  }

  if (!configured) return base

  const { connection, error } = await readConnection({ includeSecrets: false })
  if (error === 'missing_table') {
    return { ...base, needsMigration: true, schemaReady: false, canConnect: false }
  }
  if (error === 'read_failed' || error === 'not_configured') {
    return { ...base, canConnect: false, statusError: 'Could not check Google Calendar.' }
  }
  if (!connection) return { ...base, canConnect: originAllowed && schemaReady }

  return {
    ...base,
    connected: true,
    needsReconnect: connection.token_status === 'needs_reconnect',
    needsMigration: !schemaReady,
    canConnect: originAllowed && schemaReady,
    schemaReady,
    email: connection.google_email,
    calendarLabel: calendarLabel(connection.calendar_id),
  }
}
