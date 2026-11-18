export function clipMessage(message, max = 180) {
  const text = String(message || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max - 3)}...` : text
}

export class GoogleApiError extends Error {
  constructor(message, { status = 500, code = 'google_error', needsReconnect = false } = {}) {
    super(clipMessage(message) || 'Google Calendar request failed.')
    this.name = 'GoogleApiError'
    this.status = status
    this.code = code
    this.needsReconnect = needsReconnect
  }
}
