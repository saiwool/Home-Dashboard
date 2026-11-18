import { deleteConnection } from '@/lib/google/client'
import { json, jsonError, requireUser, unauthorized } from '@/lib/google/http'
import { missingGoogleEnv } from '@/lib/google/config'

export const runtime = 'nodejs'

export async function POST() {
  const { user } = await requireUser()
  if (!user) return unauthorized()
  if (missingGoogleEnv().length) return json({ error: 'Google Calendar is not set up on the server.' }, 409)
  try {
    await deleteConnection()
    return json({ ok: true })
  } catch (error) {
    return jsonError(error)
  }
}
