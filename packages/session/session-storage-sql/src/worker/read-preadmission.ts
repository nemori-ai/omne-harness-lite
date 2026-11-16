import type { JsonValue } from '@omne-harness/sql-contract'
import { handler, oneRow, text, type Executor, type Row } from './support.ts'

export const PREADMISSION_COLUMNS =
  'tenant, handoff, entry, session, execution, intent, intent_digest, outcome, outcome_digest'

const optional = (cell: Row[string] | undefined): string | null =>
  cell === null || cell === undefined ? null : text(cell)

export function preadmissionRecord(row: Row): JsonValue {
  const outcome = optional(row['outcome'])
  return {
    tenant: text(row['tenant']),
    handoff: text(row['handoff']),
    entry: optional(row['entry']),
    session: optional(row['session']),
    execution: optional(row['execution']),
    intent: JSON.parse(text(row['intent'])) as JsonValue,
    intentDigest: text(row['intent_digest']),
    outcome: outcome === null ? null : (JSON.parse(outcome) as JsonValue),
    outcomeDigest: optional(row['outcome_digest']),
  }
}

export function findPreadmission(
  port: Executor,
  tenant: string,
  key: Readonly<{ handoff: string }> | Readonly<{ entry: string }>,
): Row | undefined {
  return 'handoff' in key
    ? oneRow(
        port,
        `SELECT ${PREADMISSION_COLUMNS} FROM er_preadmission WHERE tenant = ? AND handoff = ? LIMIT 1`,
        [tenant, key.handoff],
      )
    : oneRow(
        port,
        `SELECT ${PREADMISSION_COLUMNS} FROM er_preadmission WHERE tenant = ? AND entry = ? LIMIT 1`,
        [tenant, key.entry],
      )
}

const isKey = (value: unknown): value is string => typeof value === 'string' && value !== ''

export default handler('execution-record.preadmission', (input, port) => {
  const value =
    typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
  const { tenant, handoff, entry } = value
  if (!isKey(tenant) || isKey(handoff) === isKey(entry)) throw new Error('invalid input')
  const row = findPreadmission(
    port,
    tenant,
    isKey(handoff) ? { handoff } : { entry: entry as string },
  )
  return row === undefined ? null : preadmissionRecord(row)
})
