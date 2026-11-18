import { isUuid, json, jsonError, readJson, requireUser, unauthorized } from '@/lib/google/http'
import { parseEventInput } from '@/lib/google/mapEvent'
import { deleteLinkedEvent, updateLinkedEvent } from '@/lib/google/sync'

export const runtime = 'nodejs'

export async function PATCH(request, { params }) {
  const { user } = await requireUser()
  if (!user) return unauthorized()
  const { id } = await params
  if (!isUuid(id)) return json({ error: 'Unknown event.' }, 400)
  const parsed = parseEventInput(await readJson(request))
  if (parsed.error) return json({ error: parsed.error }, 400)
  try {
    const event = await updateLinkedEvent(id, parsed.value)
    return json({ event })
  } catch (error) {
    return jsonError(error)
  }
}

export async function DELETE(_request, { params }) {
  const { user } = await requireUser()
  if (!user) return unauthorized()
  const { id } = await params
  if (!isUuid(id)) return json({ error: 'Unknown event.' }, 400)
  try {
    await deleteLinkedEvent(id)
    return json({ ok: true })
  } catch (error) {
    return jsonError(error)
  }
}
