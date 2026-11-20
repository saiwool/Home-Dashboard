import { WITH_BABY_CALENDAR_ID, WITH_BABY_LABEL } from './constants.js'

const FALLBACK_COLORS = ['#007aff', '#34c759', '#ff9500', '#af52de', '#ff2d55', '#5ac8fa', '#ffcc00']

export function sanitizeColor(value) {
  const text = String(value || '').trim()
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : null
}

export function colorForCalendar(id, stored) {
  const safe = sanitizeColor(stored)
  if (safe) return safe
  const text = String(id || '')
  let hash = 0
  for (let i = 0; i < text.length; i += 1) hash = (hash + text.charCodeAt(i)) % FALLBACK_COLORS.length
  return FALLBACK_COLORS[hash]
}

export function isWritableRole(role) {
  return role === 'owner' || role === 'writer'
}

export function isNoiseCalendar(calendar) {
  const id = String(calendar?.id || calendar?.google_calendar_id || '').toLowerCase()
  const name = String(calendar?.summary || calendar?.name || '').trim().toLowerCase()
  if (id.includes('holiday@') || id.includes('#holiday')) return true
  if (id.includes('contacts@group.v.calendar.google.com')) return true
  if (name === 'birthdays' || name.startsWith('holidays in ')) return true
  return false
}

// First time we see a calendar, suggest the ones this person owns, plus With Baby.
// Holiday and birthday feeds stay off until someone turns them on.
export function suggestSelected(calendar) {
  if (isNoiseCalendar(calendar)) return false
  const id = String(calendar?.id || calendar?.google_calendar_id || '')
  if (id === WITH_BABY_CALENDAR_ID) return true
  if (calendar?.primary || calendar?.primary_calendar) return true
  const role = calendar?.accessRole || calendar?.access_role
  return role === 'owner'
}

export function chooseSyncOwner(candidates) {
  const list = (candidates || []).filter((item) => item && item.userId)
  list.sort((a, b) => {
    const writeA = isWritableRole(a.accessRole) ? 0 : 1
    const writeB = isWritableRole(b.accessRole) ? 0 : 1
    if (writeA !== writeB) return writeA - writeB
    if (Boolean(a.primary) !== Boolean(b.primary)) return a.primary ? -1 : 1
    return String(a.userId).localeCompare(String(b.userId))
  })
  return list[0] || null
}

export function sortCalendars(calendars) {
  return [...(calendars || [])].sort((a, b) => {
    const rank = (calendar) => {
      if (calendar.primary) return 0
      if (calendar.withBaby || calendar.googleCalendarId === WITH_BABY_CALENDAR_ID) return 1
      if (calendar.selected) return 2
      return 3
    }
    const diff = rank(a) - rank(b)
    if (diff) return diff
    return String(a.name || '').localeCompare(String(b.name || ''))
  })
}

export function eventSourceLabel(event, namesById) {
  if (!event?.google_event_id && !event?.google_calendar_id) return ''
  const calendar = event.calendar_name || 'Google Calendar'
  if (event.google_calendar_id === WITH_BABY_CALENDAR_ID) return calendar || WITH_BABY_LABEL
  const owner = namesById?.[event.google_owner_id] || ''
  if (owner && owner.toLowerCase() !== calendar.toLowerCase()) return `${calendar} · ${owner}`
  return calendar
}
