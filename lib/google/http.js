import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { GoogleApiError } from './errors.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(value) {
  return UUID.test(String(value || ''))
}

export async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

export function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export function unauthorized() {
  return json({ error: 'Sign in again to use Google Calendar.' }, 401)
}

export function jsonError(error) {
  if (error instanceof GoogleApiError) {
    return json({ error: error.message, code: error.code }, error.status)
  }
  console.error('google calendar', error instanceof Error ? error.name : 'failed')
  return json({ error: 'Something went wrong with Google Calendar. Your household events are still here.' }, 500)
}

export async function readJson(request) {
  try {
    return await request.json()
  } catch {
    return null
  }
}
