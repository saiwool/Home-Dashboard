// PostgREST and Postgres signals that a table from the new-tabs migration
// has not been created yet. The UI uses this to show a setup message
// instead of throwing.

export function isMissingRelation(error) {
  if (!error) return false
  const code = String(error.code || '')
  const text = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    text.includes('does not exist') ||
    text.includes('schema cache') ||
    text.includes('could not find the table')
  )
}
