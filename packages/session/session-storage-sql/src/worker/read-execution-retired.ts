import { handler, oneRow, rowsOf, text } from './support.ts'

const WAKE_ROWS = 1000

export default handler('execution-record.retired', (input, port) => {
  const read = input as Readonly<Record<string, unknown>> | null
  const tenant = read?.['tenant']
  const generation = read?.['generation']
  if (typeof tenant !== 'string' || tenant === '') throw new Error('invalid input')
  if (typeof generation !== 'string' || generation === '') throw new Error('invalid input')
  const settled = oneRow(
    port,
    'SELECT 1 FROM er_execution WHERE tenant = ? AND settled IS NOT NULL AND settled_by <> ? LIMIT 1',
    [tenant, generation],
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
