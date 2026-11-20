export const WITH_BABY_CALENDAR_ID = 'l1662ekg9q175mvofks89hs12c@group.calendar.google.com'
export const WITH_BABY_LABEL = 'With Baby'
export const GOOGLE_MIGRATION_FILE = 'supabase/migrations/20261120_google_calendar.sql'

export const PRODUCTION_ORIGIN = 'https://home-dashboard-ebon.vercel.app'
export const LOCAL_ORIGIN = 'http://localhost:3000'
export const ALLOWED_OAUTH_ORIGINS = [PRODUCTION_ORIGIN, LOCAL_ORIGIN]

export const OAUTH_STATE_COOKIE = 'gcal_oauth_state'
export const OAUTH_ORIGIN_COOKIE = 'gcal_oauth_origin'
export const OAUTH_USER_COOKIE = 'gcal_oauth_user'
export const OAUTH_NEXT_COOKIE = 'gcal_oauth_next'

export const SYNC_PAST_DAYS = 365
export const SYNC_FUTURE_DAYS = 548
export const SYNC_THROTTLE_MS = 60 * 1000

export function safeNext(value) {
  return value === 'profile' ? 'profile' : 'calendar'
}

export function nextPath(value) {
  return safeNext(value) === 'profile' ? '/dashboard/profile' : '/dashboard/calendar'
}
