import type { JsonValue } from '@omne-harness/sql-contract'
import { handler, oneRow, text } from './support.ts'

export default handler('execution-record.request-choices', (input, port) => {
  const read = input as Readonly<Record<string, unknown>> | null
  const tenant = read?.['tenant']
  const session = read?.['session']
  const reference = read?.['reference']
  if (typeof tenant !== 'string' || tenant === '') throw new Error('invalid input')
  if (typeof session !== 'string' || session === '') throw new Error('invalid input')
  if (typeof reference !== 'string' || reference === '') throw new Error('invalid input')
  const row = oneRow(
    port,
    'SELECT payload FROM er_request_choice WHERE tenant = ? AND session = ? AND reference = ? LIMIT 1',
    [tenant, session, reference],
  )
  return {
    kind: 'choices',
    value: row === undefined ? null : (JSON.parse(text(row['payload'])) as JsonValue),
  }
})
