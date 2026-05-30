export const DEFAULT_TZ = 'America/Chicago'

export function getTodayStr(tz = DEFAULT_TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
}

export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d + days)
  return new Intl.DateTimeFormat('en-CA').format(date)
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
