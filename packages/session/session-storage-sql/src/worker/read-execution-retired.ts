import { handler, oneRow, rowsOf, text } from './support.ts'

const WAKE_ROWS = 1000

export default handler('execution-record.retired', (input, port) => {
  const tenant = (input as Readonly<Record<string, unknown>> | null)?.['tenant']
  if (typeof tenant !== 'string' || tenant === '') throw new Error('invalid input')
  const settled = oneRow(
    port,
    'SELECT 1 FROM er_execution WHERE tenant = ? AND settled IS NOT NULL LIMIT 1',
    [tenant],
  )
  const waiting = rowsOf(
    port,
    `SELECT session, execution FROM er_execution
      WHERE tenant = ? AND ended IS NOT NULL AND settled IS NULL AND acknowledged < emitted_through
      ORDER BY session, execution LIMIT ?`,
    [tenant, WAKE_ROWS],
  )
  return {
    kind: 'retired',
    settled: settled !== undefined,
    waiting: waiting.map(row => ({
      session: text(row['session']),
      execution: text(row['execution']),
    })),
  }
})
