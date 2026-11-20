import 'server-only'
import { ALLOWED_OAUTH_ORIGINS } from './constants.js'

export const GOOGLE_ENV_VARS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'SUPABASE_SERVICE_ROLE_KEY',
]

export function missingGoogleEnv() {
  return GOOGLE_ENV_VARS.filter((name) => !String(process.env[name] || '').trim())
}

export function googleConfigured() {
  return missingGoogleEnv().length === 0
}

export function allowedOrigin(request) {
  const origin = request?.nextUrl?.origin || ''
  return ALLOWED_OAUTH_ORIGINS.includes(origin) ? origin : null
}
