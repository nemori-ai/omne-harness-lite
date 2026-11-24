import { big, handler, oneRow } from './support.ts'

// Whether the logs of a tenant moved since a list of them was read: how many sessions it has, the
// sum of their heads, how many are archived. Heads only rise, so equal stamps are equal lists.
export default handler('session.search-stamp', (raw, port) => {
  const { tenant } = raw as unknown as { tenant: unknown }
  if (typeof tenant !== 'string' || tenant === '') throw new Error('invalid input')
  const heads = oneRow(
    port,
    'SELECT COUNT(*) AS n, COALESCE(SUM(tail), 0) AS total FROM sl_journal WHERE tenant = ? LIMIT 1',
    [tenant],
  )
  const archived = oneRow(
    port,
    "SELECT COUNT(*) AS n FROM sl_session_list WHERE tenant = ? AND lifecycle = 'archived' LIMIT 1",
    [tenant],
  )
  return {
    sessions: Number(big(heads?.['n'] ?? 0n)),
    total: String(big(heads?.['total'] ?? 0n)),
    archived: Number(big(archived?.['n'] ?? 0n)),
  }
})
