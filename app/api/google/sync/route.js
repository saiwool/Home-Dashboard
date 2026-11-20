import { json, jsonError, requireUser, unauthorized } from '@/lib/google/http'
import { syncHouseholdFromGoogle } from '@/lib/google/sync'

export const runtime = 'nodejs'

export async function POST(request) {
  const { user } = await requireUser()
  if (!user) return unauthorized()
  let force = false
  try {
    const body = await request.json()
    force = Boolean(body?.force)
  } catch {
    force = false
  }
  try {
    return json(await syncHouseholdFromGoogle({ force }))
  } catch (error) {
    return jsonError(error)
  }
}
