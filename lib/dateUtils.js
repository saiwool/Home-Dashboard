export const DEFAULT_TZ = 'America/Chicago'

export function getTodayStr(tz = DEFAULT_TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
}

export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d + days)
  return new Intl.DateTimeFormat('en-CA').format(date)
}

// Monday of the week containing dateStr. Weeks in this app start on Monday.
export function startOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const day = new Date(y, m - 1, d).getDay()
  const diff = day === 0 ? -6 : 1 - day
  return addDays(dateStr, diff)
}

export function getMonthRange(offset = 0, tz = DEFAULT_TZ) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(new Date())
  let year = parseInt(parts.find((p) => p.type === 'year').value)
  let month = parseInt(parts.find((p) => p.type === 'month').value) + offset
  while (month > 12) { month -= 12; year++ }
  while (month < 1) { month += 12; year-- }
  const monthStr = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()
  const label = new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  return {
    start: `${year}-${monthStr}-01`,
    end: `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`,
    label,
  }
}

export function addMonths(dateStr, months) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const monthIndex = m - 1 + months
  const lastDay = new Date(y, monthIndex + 1, 0).getDate()
  const date = new Date(y, monthIndex, Math.min(d, lastDay))
  return new Intl.DateTimeFormat('en-CA').format(date)
}

// Next due date after a task is done, or when it is first scheduled.
export function advanceByFrequency(dateStr, frequency, customDays) {
  switch (frequency) {
    case 'weekly':
      return addDays(dateStr, 7)
    case 'monthly':
      return addMonths(dateStr, 1)
    case 'quarterly':
      return addMonths(dateStr, 3)
    case 'semiannual':
      return addMonths(dateStr, 6)
    case 'yearly':
      return addMonths(dateStr, 12)
    case 'custom':
      return addDays(dateStr, Math.max(1, parseInt(customDays, 10) || 1))
    default:
      return addMonths(dateStr, 1)
  }
}

export function fmtRelative(dateStr, todayStr) {
  if (!dateStr) return null
  const diff = Math.ceil(
    (new Date(dateStr + 'T00:00:00') - new Date(todayStr + 'T00:00:00')) / 86400000
  )
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff < 0) return `${Math.abs(diff)}d overdue`
  if (diff < 7) return `In ${diff} days`
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function getGreetingWord(tz = DEFAULT_TZ) {
  const hourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hour12: false,
  }).format(new Date())
  const h = parseInt(hourStr)
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

export function isValidTimeZone(timeZone) {
  try {
    if (!timeZone || typeof timeZone !== 'string') return false
    Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)
  const map = {}
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value
  }
  let year = Number(map.year)
  let month = Number(map.month)
  let day = Number(map.day)
  let hour = Number(map.hour)
  const minute = Number(map.minute)
  const second = Number(map.second)
  if ([year, month, day, hour, minute, second].some((n) => Number.isNaN(n))) {
    throw new Error('Could not read the time zone.')
  }
  if (hour === 24) {
    hour = 0
    const rolled = new Date(Date.UTC(year, month - 1, day + 1))
    year = rolled.getUTCFullYear()
    month = rolled.getUTCMonth() + 1
    day = rolled.getUTCDate()
  }
  return { year, month, day, hour, minute, second }
}

function timeZoneOffset(utcMs, timeZone) {
  const parts = zonedParts(new Date(utcMs), timeZone)
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return asUtc - utcMs
}

// Wall-clock date and time in a time zone, as a UTC ISO string.
export function zonedTimeToUtc(dateStr, timeStr, timeZone = DEFAULT_TZ) {
  const [year, month, day] = String(dateStr).split('-').map(Number)
  const [hour, minute] = String(timeStr).split(':').map(Number)
  if ([year, month, day, hour, minute].some((n) => !Number.isFinite(n))) {
    throw new Error('Invalid date or time.')
  }
  const wall = Date.UTC(year, month - 1, day, hour, minute, 0)
  const offset = timeZoneOffset(wall, timeZone)
  let utc = wall - offset
  const offset2 = timeZoneOffset(utc, timeZone)
  if (offset !== offset2) utc = wall - offset2
  return new Date(utc).toISOString()
}

export function formatInTimeZone(date, timeZone = DEFAULT_TZ) {
  const parts = zonedParts(date, timeZone)
  const month = String(parts.month).padStart(2, '0')
  const day = String(parts.day).padStart(2, '0')
  return `${parts.year}-${month}-${day}`
}

export function formatWallTime(date, timeZone = DEFAULT_TZ) {
  const parts = zonedParts(date, timeZone)
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`
}

export function formatDisplayTime(date, timeZone = DEFAULT_TZ) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function addMinutesToWallTime(dateStr, timeStr, minutes, timeZone = DEFAULT_TZ) {
  const iso = zonedTimeToUtc(dateStr, timeStr, timeZone)
  const next = new Date(new Date(iso).getTime() + minutes * 60000)
  return {
    date: formatInTimeZone(next, timeZone),
    time: formatWallTime(next, timeZone),
  }
}
