// The original batch of one operation of the execution record provider, or null: the operation key
// (`er_operation`) and the facts of the batch it names, in one snapshot. No answer is stored; the
// provider derives the answer of a recalled operation from this batch. An operation of another
// tenant reads as null, the same as one that was never written.
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
  return {
    digest: text(row['digest']),
    session,
    execution: text(row['execution']),
    published: String(published),
    facts: facts.map(factOutput),
  }
})
