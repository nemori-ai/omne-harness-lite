import type { JsonValue } from '@omne-harness/sql-contract'
import { EXECUTION_BATCH_MAX_FACTS } from '../codec.ts'
import { FACT_COLUMNS, factOutput, factRows } from './fact-rows.ts'
import { big, handler, oneRow, text } from './support.ts'

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
    'SELECT session, execution, digest, published FROM er_operation WHERE tenant = ? AND operation = ? LIMIT 1',
    [tenant, operation],
  )
  if (row === undefined) return null
  const session = text(row['session'])
  const published = big(row['published'])
  const facts = factRows(
    port,
    `SELECT ${FACT_COLUMNS} FROM er_fact WHERE tenant = ? AND session = ? AND pub = ?
      ORDER BY ord LIMIT ?`,
    [tenant, session, published, EXECUTION_BATCH_MAX_FACTS],
  )
  const execution = text(row['execution'])
  const tombstone =
    facts.length === 0
      ? oneRow(
          port,
          'SELECT settled, revision, receipt FROM er_execution WHERE tenant = ? AND execution = ? AND settled IS NOT NULL LIMIT 1',
          [tenant, execution],
        )
      : undefined
  return {
    digest: text(row['digest']),
    session,
    execution,
    published: String(published),
    facts: facts.map(factOutput),
    ...(tombstone === undefined
      ? {}
      : {
          reclaimed: {
            settled: String(big(tombstone['settled'])),
            revision: text(tombstone['revision']),
            receipt: JSON.parse(text(tombstone['receipt'])) as JsonValue,
          },
        }),
  }
})
