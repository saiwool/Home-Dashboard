import { json, jsonError, readJson, requireUser, unauthorized } from '@/lib/google/http'
import { parseEventInput } from '@/lib/google/mapEvent'
import { createLinkedEvent } from '@/lib/google/sync'

export const runtime = 'nodejs'

export async function POST(request) {
  const { user } = await requireUser()
  if (!user) return unauthorized()
  const parsed = parseEventInput(await readJson(request))
  if (parsed.error) return json({ error: parsed.error }, 400)
  try {
    const event = await createLinkedEvent(user.id, parsed.value)
    return json({ event })
  } catch (error) {
    return jsonError(error)
  }
}
