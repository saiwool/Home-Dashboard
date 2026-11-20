import { colorForCalendar, eventSourceLabel, sanitizeColor } from './google/calendarChoice.js'
import { addDays, addMonths, formatDisplayTime, formatInTimeZone, formatWallTime } from './dateUtils.js'

export const CALENDAR_VIEWS = ['month', 'week', 'day', 'schedule']
export const DEFAULT_CALENDAR_VIEW = 'month'
export const HOUSEHOLD_CALENDAR_ID = 'household'
export const HOUSEHOLD_COLOR = '#007aff'
export const HOUR_HEIGHT = 48
export const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MIN_VISUAL_MINUTES = 25

export function isCalendarView(value) {
  return CALENDAR_VIEWS.includes(value)
}

export function parseHiddenIds(raw) {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id) => typeof id === 'string' && id.length > 0 && id.length < 600)
  } catch {
    return []
  }
}

export function startOfSundayWeek(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const weekday = new Date(year, month - 1, day).getDay()
  return addDays(dateStr, -weekday)
}

export function weekDates(dateStr) {
  const start = startOfSundayWeek(dateStr)
  return Array.from({ length: 7 }, (_, index) => addDays(start, index))
}

export function monthMatrix(anchorDate) {
  const [year, month] = anchorDate.split('-').map(Number)
  const first = `${year}-${String(month).padStart(2, '0')}-01`
  let cursor = startOfSundayWeek(first)
  const weeks = []
  for (let week = 0; week < 6; week += 1) {
    const days = []
    for (let index = 0; index < 7; index += 1) {
      days.push(cursor)
      cursor = addDays(cursor, 1)
    }
    weeks.push(days)
  }
  return weeks
}

export function shiftAnchor(view, anchor, direction) {
  const step = direction < 0 ? -1 : 1
  if (view === 'month') return addMonths(anchor, step)
  if (view === 'day') return addDays(anchor, step)
  return addDays(anchor, step * 7)
}

export function viewHeading(view, anchor) {
  const [year, month, day] = anchor.split('-').map(Number)
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  if (view === 'day') {
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
  }
  if (view === 'week' || view === 'schedule') {
    const days = weekDates(anchor)
    const [startYear, startMonth] = days[0].split('-').map(Number)
    const [endYear, endMonth, endDay] = days[6].split('-').map(Number)
    if (startYear === endYear && startMonth === endMonth) {
      return new Date(startYear, startMonth - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    }
    const startText = new Date(startYear, startMonth - 1, 1).toLocaleDateString('en-US', { month: 'short' })
    const endText = new Date(endYear, endMonth - 1, endDay).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    })
    return `${startText} – ${endText}`
  }
  return monthLabel
}

export function dateHeading(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function weekdayName(dateStr, width = 'short') {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { weekday: width })
}

export function dayNumber(dateStr) {
  return Number(dateStr.slice(8, 10))
}

export function monthKey(dateStr) {
  return dateStr.slice(0, 7)
}

export function eventInterval(event, timeZone) {
  const startDate = event.start_date
  const rawEnd = event.end_date && event.end_date >= startDate ? event.end_date : startDate
  const timed = event.all_day === false && event.start_time
  if (!timed) return { allDay: true, startDate, endDate: rawEnd }

  const start = new Date(event.start_time)
  if (Number.isNaN(start.getTime())) return { allDay: true, startDate, endDate: rawEnd }
  let end = event.end_time ? new Date(event.end_time) : new Date(start.getTime() + 60 * 60000)
  if (Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    end = new Date(start.getTime() + 60 * 60000)
  }
  return {
    allDay: false,
    startDate: formatInTimeZone(start, timeZone),
    endDate: formatInTimeZone(end, timeZone),
    start,
    end,
  }
}

export function eventCoversDate(event, dateStr, timeZone) {
  const interval = eventInterval(event, timeZone)
  return dateStr >= interval.startDate && dateStr <= interval.endDate
}

function minutesOnDate(date, dateStr, timeZone) {
  const day = formatInTimeZone(date, timeZone)
  if (day < dateStr) return 0
  if (day > dateStr) return 24 * 60
  const [hour, minute] = formatWallTime(date, timeZone).split(':').map(Number)
  return hour * 60 + minute
}

export function timedBlock(event, dateStr, timeZone) {
  const interval = eventInterval(event, timeZone)
  if (interval.allDay) return null
  if (dateStr < interval.startDate || dateStr > interval.endDate) return null
  const startMin = minutesOnDate(interval.start, dateStr, timeZone)
  let endMin = minutesOnDate(interval.end, dateStr, timeZone)
  if (endMin <= startMin) endMin = Math.min(24 * 60, startMin + 60)
  if (endMin - startMin < MIN_VISUAL_MINUTES) {
    endMin = Math.min(24 * 60, startMin + MIN_VISUAL_MINUTES)
  }
  return { startMin, endMin }
}

export function layoutOverlaps(blocks) {
  const sorted = [...(blocks || [])].sort((a, b) => (
    a.startMin - b.startMin || b.endMin - a.endMin || String(a.id).localeCompare(String(b.id))
  ))
  const placed = []
  let cluster = []
  let clusterEnd = -1

  function assign(group) {
    const columns = []
    const rows = []
    const ordered = [...group].sort((a, b) => (
      a.startMin - b.startMin || (b.endMin - b.startMin) - (a.endMin - a.startMin)
    ))
    for (const item of ordered) {
      let column = 0
      while (columns[column]?.some((other) => other.endMin > item.startMin && other.startMin < item.endMin)) {
        column += 1
      }
      if (!columns[column]) columns[column] = []
      columns[column].push(item)
      rows.push({ ...item, column })
    }
    const count = Math.max(columns.length, 1)
    for (const row of rows) placed.push({ ...row, columns: count })
  }

  for (const item of sorted) {
    if (cluster.length && item.startMin >= clusterEnd) {
      assign(cluster)
      cluster = []
      clusterEnd = -1
    }
    cluster.push(item)
    clusterEnd = Math.max(clusterEnd, item.endMin)
  }
  if (cluster.length) assign(cluster)
  return placed
}

export function dayTimedBlocks(events, dateStr, timeZone) {
  const blocks = []
  for (const event of events || []) {
    const block = timedBlock(event, dateStr, timeZone)
    if (!block) continue
    blocks.push({ id: event.id, event, ...block })
  }
  return layoutOverlaps(blocks)
}

export function eventsOnDate(events, dateStr, timeZone) {
  return (events || [])
    .filter((event) => eventCoversDate(event, dateStr, timeZone))
    .sort((a, b) => compareEvents(a, b, timeZone))
}

function compareEvents(a, b, timeZone) {
  const aAll = eventInterval(a, timeZone).allDay ? 0 : 1
  const bAll = eventInterval(b, timeZone).allDay ? 0 : 1
  if (aAll !== bAll) return aAll - bAll
  const aStart = a.start_time || ''
  const bStart = b.start_time || ''
  if (aStart !== bStart) return aStart < bStart ? -1 : 1
  return String(a.title || '').localeCompare(String(b.title || ''))
}

export function allDayOnDate(events, dateStr, timeZone) {
  return eventsOnDate(events, dateStr, timeZone).filter((event) => eventInterval(event, timeZone).allDay)
}

export function visibleChips(events, limit = 3) {
  const list = events || []
  if (list.length <= limit) return { visible: list, more: 0 }
  const count = Math.max(limit - 1, 0)
  return { visible: list.slice(0, count), more: list.length - count }
}

export function calendarIdForEvent(event) {
  return event?.google_calendar_id || HOUSEHOLD_CALENDAR_ID
}

export function filterEvents(events, hiddenIds) {
  const hidden = new Set(hiddenIds || [])
  return (events || []).filter((event) => !hidden.has(calendarIdForEvent(event)))
}

export function eventColor(event) {
  return sanitizeColor(event?.calendar_color)
    || (event?.google_calendar_id ? colorForCalendar(event.google_calendar_id) : HOUSEHOLD_COLOR)
}

export function eventCalendarName(event, namesById) {
  if (!event?.google_calendar_id && !event?.google_event_id) return 'Household'
  return eventSourceLabel(event, namesById) || event.calendar_name || 'Google Calendar'
}

export function canChangeEvent(event, userId) {
  if (!event) return false
  return Boolean(event.google_event_id) || Boolean(userId && event.created_by === userId)
}

export function foregroundFor(hex) {
  const color = sanitizeColor(hex) || HOUSEHOLD_COLOR
  const red = parseInt(color.slice(1, 3), 16)
  const green = parseInt(color.slice(3, 5), 16)
  const blue = parseInt(color.slice(5, 7), 16)
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
  return luminance > 0.64 ? '#1C1C1E' : '#ffffff'
}

export function hexToRgba(hex, alpha) {
  const color = sanitizeColor(hex) || HOUSEHOLD_COLOR
  const red = parseInt(color.slice(1, 3), 16)
  const green = parseInt(color.slice(3, 5), 16)
  const blue = parseInt(color.slice(5, 7), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

export function shortTime(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).formatToParts(date)
  const hour = parts.find((part) => part.type === 'hour')?.value || ''
  const minute = parts.find((part) => part.type === 'minute')?.value || '00'
  const period = parts.find((part) => part.type === 'dayPeriod')?.value || ''
  if (minute === '00') return `${hour} ${period}`.trim()
  return `${hour}:${minute} ${period}`.trim()
}

export function chipTime(event, dateStr, timeZone) {
  const interval = eventInterval(event, timeZone)
  if (interval.allDay) return 'All day'
  if (interval.startDate !== dateStr) return shortTime(interval.start, timeZone)
  return shortTime(interval.start, timeZone)
}

export function eventWhenLabel(event, timeZone) {
  const interval = eventInterval(event, timeZone)
  const longDate = (dateStr) => {
    const [year, month, day] = dateStr.split('-').map(Number)
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }
  if (interval.allDay) {
    if (interval.startDate === interval.endDate) return longDate(interval.startDate)
    return `${longDate(interval.startDate)} – ${longDate(interval.endDate)}`
  }
  const startDay = formatInTimeZone(interval.start, timeZone)
  const endDay = formatInTimeZone(interval.end, timeZone)
  const startLabel = formatDisplayTime(interval.start, timeZone)
  const endLabel = formatDisplayTime(interval.end, timeZone)
  if (startDay === endDay) return `${longDate(startDay)} · ${startLabel} – ${endLabel}`
  return `${longDate(startDay)}, ${startLabel} – ${longDate(endDay)}, ${endLabel}`
}

export function formatHourLabel(hour) {
  if (hour === 0) return '12 AM'
  if (hour < 12) return `${hour} AM`
  if (hour === 12) return '12 PM'
  return `${hour - 12} PM`
}

export function minutesToTime(minutes) {
  const clamped = Math.max(0, Math.min(24 * 60, minutes))
  if (clamped >= 24 * 60) return '23:59'
  const hour = Math.floor(clamped / 60)
  const minute = clamped % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function slotFromOffset(offsetY, hourHeight = HOUR_HEIGHT) {
  const raw = Math.max(0, (offsetY / hourHeight) * 60)
  let startMin = Math.floor(raw / 30) * 30
  if (startMin > 23 * 60 + 30) startMin = 23 * 60 + 30
  const endMin = Math.min(startMin + 60, 24 * 60)
  return {
    startTime: minutesToTime(startMin),
    endTime: minutesToTime(endMin),
  }
}

export function nowMinutes(date, timeZone) {
  const [hour, minute] = formatWallTime(date, timeZone).split(':').map(Number)
  return hour * 60 + minute
}

export function scheduleGroups(events, fromDate, timeZone, days = 21) {
  const groups = []
  let cursor = fromDate
  for (let index = 0; index < days; index += 1) {
    const items = eventsOnDate(events, cursor, timeZone)
    if (items.length) groups.push({ date: cursor, events: items })
    cursor = addDays(cursor, 1)
  }
  return groups
}

export function collectCalendars(events, googleCalendars) {
  const map = new Map()
  map.set(HOUSEHOLD_CALENDAR_ID, {
    id: HOUSEHOLD_CALENDAR_ID,
    name: 'Household',
    color: HOUSEHOLD_COLOR,
    hint: 'Saved in Home',
  })
  const selected = (googleCalendars || []).filter((calendar) => calendar.selected && calendar.googleCalendarId)
  selected.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
  for (const calendar of selected) {
    map.set(calendar.googleCalendarId, {
      id: calendar.googleCalendarId,
      name: calendar.name || 'Calendar',
      color: sanitizeColor(calendar.color) || colorForCalendar(calendar.googleCalendarId),
      hint: calendar.withBaby ? 'With Baby' : calendar.primary ? 'Primary' : (calendar.writable ? '' : 'View only'),
    })
  }
  for (const event of events || []) {
    const id = event.google_calendar_id
    if (!id || map.has(id)) continue
    map.set(id, {
      id,
      name: event.calendar_name || 'Google Calendar',
      color: eventColor(event),
      hint: 'Synced for the household',
    })
  }
  return [...map.values()]
}

export function syncedAgo(iso, nowMs = Date.now()) {
  if (!iso) return 'Not synced yet'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'Synced'
  const minutes = Math.round((nowMs - then) / 60000)
  if (minutes < 1) return 'Synced just now'
  if (minutes < 60) return `Synced ${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 36) return `Synced ${hours} hr ago`
  return `Synced ${new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

export function googleStatusLine(status) {
  if (!status) return 'Checking Google…'
  if (status.statusError) return status.statusError
  if (!status.configured) return 'Google Calendar is not turned on yet.'
  if (status.needsMigration) return 'A one-time database update is needed before Google can connect.'
  if (!status.connected) return 'Not connected for this login.'
  if (status.needsReconnect) return 'Google needs you to connect again.'
  return status.email || 'Connected'
}
