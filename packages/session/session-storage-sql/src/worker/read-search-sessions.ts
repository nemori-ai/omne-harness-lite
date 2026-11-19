import { handler, rowsOf, text } from './support.ts'

// Every session of a tenant with the revision its log stands at: what the history search compares
// its index against. One range scan of the journal heads; no entry is read.
type Input = Readonly<{ tenant: string; after: string | null; limit: number }>

const LIMIT = 20_000

export default handler('session.search-sessions', (raw, port) => {
  const input = raw as unknown as Input
  if (
    typeof input.tenant !== 'string' ||
    input.tenant === '' ||
    !(input.after === null || typeof input.after === 'string') ||
    !Number.isInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > LIMIT
  )
    throw new Error('invalid input')
  const rows = rowsOf(
    port,
    `SELECT j.session AS session, j.tail AS tail, l.lifecycle AS lifecycle
       FROM sl_journal j LEFT JOIN sl_session_list l
         ON l.tenant = j.tenant AND l.session = j.session
      WHERE j.tenant = ? AND j.session > ? ORDER BY j.session LIMIT ?`,
    [input.tenant, input.after ?? '', BigInt(input.limit + 1)],
  )
  return {
    sessions: rows
      .slice(0, input.limit)
      .map(row => [text(row['session']), String(row['tail']), row['lifecycle'] === 'archived']),
    more: rows.length > input.limit,
  }
})
