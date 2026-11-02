// The original answer of one operation of the execution record provider, or null.
import type { JsonValue } from '@omne-harness/sql-contract'
import { handler, oneRow, text } from './support.ts'

export default handler('execution-record.operation', (input, port) => {
  const value =
    typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
  const { tenant, operation } = value
  if (
    typeof tenant !== 'string' ||
    tenant === '' ||
    typeof operation !== 'string' ||
    operation === ''
  )
    throw new Error('invalid input')
  const row = oneRow(
    port,
    'SELECT digest, answer FROM er_operation WHERE tenant = ? AND operation = ? LIMIT 1',
    [tenant, operation],
  )
  return row === undefined
    ? null
    : { digest: text(row['digest']), answer: JSON.parse(text(row['answer'])) as JsonValue }
})
