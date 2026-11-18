import 'server-only'
import { ALLOWED_OAUTH_ORIGINS } from './messages.js'

export const WITH_BABY_CALENDAR_ID = 'l1662ekg9q175mvofks89hs12c@group.calendar.google.com'

export const GOOGLE_ENV_VARS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_CALENDAR_ID',
  'SUPABASE_SERVICE_ROLE_KEY',
]

export function missingGoogleEnv() {
  return GOOGLE_ENV_VARS.filter((name) => !String(process.env[name] || '').trim())
}

export function calendarId() {
  return String(process.env.GOOGLE_CALENDAR_ID || '').trim()
}

export function calendarLabel(id = calendarId()) {
  return id === WITH_BABY_CALENDAR_ID ? 'with Baby' : 'Google Calendar'
}

export function allowedOrigin(request) {
  const origin = request.nextUrl?.origin || ''
  return ALLOWED_OAUTH_ORIGINS.includes(origin) ? origin : null
}
