export const CALENDAR_EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events'
export const CALENDAR_LIST_SCOPE = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly'
export const CALENDAR_FULL_SCOPE = 'https://www.googleapis.com/auth/calendar'

const LIST_SCOPES = new Set([
  CALENDAR_LIST_SCOPE,
  'https://www.googleapis.com/auth/calendar.calendarlist',
  'https://www.googleapis.com/auth/calendar.readonly',
  CALENDAR_FULL_SCOPE,
])

const WRITE_SCOPES = new Set([
  CALENDAR_EVENTS_SCOPE,
  CALENDAR_FULL_SCOPE,
])

export const GOOGLE_SCOPES = ['openid', 'email', CALENDAR_LIST_SCOPE, CALENDAR_EVENTS_SCOPE].join(' ')

export function scopeSet(scope) {
  return new Set(String(scope || '').split(/\s+/).filter(Boolean))
}

export function hasRequiredScopes(scope) {
  const parts = scopeSet(scope)
  let canList = false
  let canWrite = false
  for (const part of parts) {
    if (LIST_SCOPES.has(part)) canList = true
    if (WRITE_SCOPES.has(part)) canWrite = true
  }
  return canList && canWrite
}
