import {
  addDays,
  addMinutesToWallTime,
  DEFAULT_TZ,
  formatInTimeZone,
  formatWallTime,
  isValidTimeZone,
  zonedTimeToUtc,
} from '../dateUtils.js'

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const CALENDAR_ID = /^[^\s/]{1,512}$/

function isRealDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return false
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function clip(value, max) {
  const text = String(value || '')
  return text.length > max ? text.slice(0, max) : text
}

export function parseEventInput(body, fallbackTimeZone = DEFAULT_TZ) {
  if (!body || typeof body !== 'object') return { error: 'Enter the event again.' }
  const title = String(body.title || '').trim()
  if (!title) return { error: 'Title is required.' }
  if (title.length > 300) return { error: 'Title is too long.' }
  const description = String(body.description || '').trim()
  if (description.length > 8000) return { error: 'Notes are too long.' }

  const startDate = String(body.start_date || '')
  const endDate = String(body.end_date || startDate)
  if (!isRealDate(startDate) || !isRealDate(endDate)) return { error: 'Enter a valid date.' }
  if (endDate < startDate) return { error: 'The end date cannot be before the start date.' }

  let timeZone = String(body.time_zone || fallbackTimeZone)
  if (!isValidTimeZone(timeZone)) timeZone = fallbackTimeZone

  const calendarRaw = String(body.google_calendar_id || '').trim()
  if (calendarRaw && !CALENDAR_ID.test(calendarRaw)) return { error: 'Choose a calendar.' }

  const allDay = body.all_day !== false
  const base = {
    title,
    description,
    allDay,
    startDate,
    endDate,
    timeZone,
    calendarId: calendarRaw || null,
  }

  if (allDay) {
    return { value: { ...base, allDay: true, startTime: null, endTime: null } }
  }

  const startTime = String(body.start_time || '')
  const endTime = String(body.end_time || '')
  if (!TIME.test(startTime) || !TIME.test(endTime)) {
    return { error: 'Enter a start and end time, or mark the event as all day.' }
  }

  let startIso
  let endIso
  try {
    startIso = zonedTimeToUtc(startDate, startTime, timeZone)
    endIso = zonedTimeToUtc(endDate, endTime, timeZone)
  } catch {
    return { error: 'Enter a valid time.' }
  }
  if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
    return { error: 'The end time must be after the start time.' }
  }

  return {
    value: {
      ...base,
      allDay: false,
      startTime,
      endTime,
      startIso,
      endIso,
    },
  }
}

export function toGoogleEventBody(input) {
  const timeZone = isValidTimeZone(input.timeZone) ? input.timeZone : DEFAULT_TZ
  const body = {
    summary: String(input.title || '').trim() || '(No title)',
    description: input.description ? String(input.description) : '',
  }
  if (input.dashboardId) {
    body.extendedProperties = { private: { dashboardId: String(input.dashboardId) } }
  }

  if (input.allDay) {
    const startDate = input.startDate
    let endInclusive = input.endDate || startDate
    if (endInclusive < startDate) endInclusive = startDate
    body.start = { date: startDate }
    body.end = { date: addDays(endInclusive, 1) }
    return body
  }

  let endDate = input.endDate || input.startDate
  let endTime = input.endTime || input.startTime
  const startIso = zonedTimeToUtc(input.startDate, input.startTime, timeZone)
  const endIso = zonedTimeToUtc(endDate, endTime, timeZone)
  if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
    const bumped = addMinutesToWallTime(input.startDate, input.startTime, 30, timeZone)
    endDate = bumped.date
    endTime = bumped.time
  }
  body.start = { dateTime: `${input.startDate}T${input.startTime}:00`, timeZone }
  body.end = { dateTime: `${endDate}T${endTime}:00`, timeZone }
  return body
}

export function fromGoogleEvent(event) {
  if (!event?.start) return null
  const title = clip(String(event.summary || '').trim() || '(No title)', 300)
  const rawDescription = typeof event.description === 'string' ? event.description : ''
  const description = rawDescription.trim() ? clip(rawDescription, 8000) : null

  if (event.start.date) {
    const startDate = event.start.date
    if (!isRealDate(startDate)) return null
    const endExclusive = event.end?.date && isRealDate(event.end.date) ? event.end.date : addDays(startDate, 1)
    let endDate = addDays(endExclusive, -1)
    if (endDate < startDate) endDate = startDate
    return {
      title,
      description,
      all_day: true,
      start_date: startDate,
      end_date: endDate,
      start_time: null,
      end_time: null,
    }
  }

  if (!event.start.dateTime) return null
  const start = new Date(event.start.dateTime)
  if (Number.isNaN(start.getTime())) return null
  const end = event.end?.dateTime ? new Date(event.end.dateTime) : start
  const safeEnd = Number.isNaN(end.getTime()) ? start : end
  const zone = isValidTimeZone(event.start.timeZone) ? event.start.timeZone : DEFAULT_TZ
  return {
    title,
    description,
    all_day: false,
    start_date: formatInTimeZone(start, zone),
    end_date: formatInTimeZone(safeEnd, zone),
    start_time: start.toISOString(),
    end_time: safeEnd.toISOString(),
  }
}

export function eventRowToInput(row) {
  const timeZone = DEFAULT_TZ
  if (!row.start_time || row.all_day !== false) {
    return {
      title: row.title,
      description: row.description || '',
      allDay: true,
      startDate: row.start_date,
      endDate: row.end_date || row.start_date,
      timeZone,
      dashboardId: row.id,
    }
  }
  const start = new Date(row.start_time)
  const end = new Date(row.end_time || row.start_time)
  return {
    title: row.title,
    description: row.description || '',
    allDay: false,
    startDate: formatInTimeZone(start, timeZone),
    endDate: formatInTimeZone(end, timeZone),
    startTime: formatWallTime(start, timeZone),
    endTime: formatWallTime(end, timeZone),
    timeZone,
    dashboardId: row.id,
  }
}
