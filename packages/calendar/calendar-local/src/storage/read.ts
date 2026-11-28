import { z } from 'zod'
import type {
  ReadHandlerModule,
  ReadPort,
  SqlCell,
  SqlValue,
} from '@omne-harness/sql-contract/worker'
import type { JsonValue } from '@omne-harness/sql-contract'
import { canonical } from './encoding.ts'
import { HANDLER, PROTOCOL, candidateRowSchema, readSchema, type RepositoryRead } from './schema.ts'
import { fullCommand, readVersion } from './snapshots.ts'

function one(port: ReadPort, sql: string, params: readonly SqlValue[]): JsonValue {
  const row = port.execute(`${sql} LIMIT 1`, params).rows[0]
  return row === undefined ? null : z.json().parse(JSON.parse(z.string().parse(row[0])))
}
const record = (row: readonly SqlCell[]): JsonValue =>
  z.json().parse(JSON.parse(z.string().parse(row[1])))
function page(
  port: ReadPort,
  sql: string,
  params: readonly SqlValue[],
  limit: number,
  item: (row: readonly SqlCell[]) => JsonValue = record,
): JsonValue {
  const rows = port.execute(sql, params).rows
  const selected = rows.slice(0, limit)
  const last = selected.at(-1)
  return {
    items: selected.map(item),
    nextCursor: rows.length > limit && last !== undefined ? String(last[0]) : null,
  }
}
const CANDIDATE = 'c.canonical_command, c.record, s.digest, s.snapshot'
const WITH_SNAPSHOT = 'LEFT JOIN ca_snapshots s ON s.digest = c.snapshot_digest'
function candidate(row: readonly SqlCell[]): JsonValue {
  const [command, stored, digest, text] = row
  const { candidateRef, receipt } = candidateRowSchema.parse(JSON.parse(z.string().parse(stored)))
  return z.json().parse(
    JSON.parse(
      canonical({
        candidateRef,
        command: fullCommand(command, { digest, text }),
        receipt,
      }),
    ),
  )
}
function oneCandidate(port: ReadPort, sql: string, params: readonly SqlValue[]): JsonValue {
  const row = port.execute(`${sql} LIMIT 1`, params).rows[0]
  return row === undefined ? null : candidate(row)
}
function read(input: RepositoryRead, port: ReadPort): JsonValue {
  switch (input.kind) {
    case 'calendar':
      return one(port, 'SELECT directory FROM ca_current WHERE calendar_id = ?', [input.calendarId])
    case 'snapshot':
      return readVersion(port, input.calendarId, input.version)
    case 'candidate':
      return oneCandidate(
        port,
        `SELECT ${CANDIDATE} FROM ca_candidates c ${WITH_SNAPSHOT} WHERE c.operation_ref = ?`,
        [input.candidateRef],
      )
    case 'publishedCandidate':
      return oneCandidate(
        port,
        `SELECT ${CANDIDATE} FROM ca_versions v LEFT JOIN ca_candidates c ON c.operation_ref = v.operation_ref ${WITH_SNAPSHOT} WHERE v.calendar_id = ? AND v.version_id = ?`,
        [input.calendarId, input.versionId],
      )
    case 'operation':
      return oneCandidate(
        port,
        `SELECT ${CANDIDATE} FROM ca_candidates c ${WITH_SNAPSHOT} WHERE c.operation_ref = ?`,
        [input.operationRef],
      )
    case 'calendars':
      return page(
        port,
        'SELECT calendar_id, directory FROM ca_current WHERE calendar_id > ? ORDER BY calendar_id LIMIT ?',
        [input.after ?? '', input.limit + 1],
        input.limit,
      )
    case 'versions':
      return page(
        port,
        'SELECT version_id, version_info FROM ca_versions WHERE calendar_id = ? AND version_id > ? ORDER BY version_id LIMIT ?',
        [input.calendarId, input.after ?? '', input.limit + 1],
        input.limit,
      )
    case 'candidates':
      return page(
        port,
        `SELECT c.sequence, ${CANDIDATE} FROM ca_candidates c ${WITH_SNAPSHOT} WHERE c.calendar_id = ? AND c.sequence > ? ORDER BY c.sequence LIMIT ?`,
        [input.calendarId, cursor(input.after), input.limit + 1],
        input.limit,
        row => candidate(row.slice(1)),
      )
    case 'reactions':
      return page(
        port,
        'SELECT sequence, record FROM ca_outbox WHERE system_scope_ref = ? AND handoff_ref IS NULL AND sequence > ? ORDER BY sequence LIMIT ?',
        [input.systemScopeRef, cursor(input.after), input.limit + 1],
        input.limit,
      )
  }
}
function cursor(value: string | null): number {
  if (value === null) return 0
  if (!/^\d+$/.test(value)) throw new Error('Invalid sequence cursor')
  return z.int().nonnegative().parse(Number(value))
}
export default {
  handler: HANDLER,
  protocol: PROTOCOL,
  read(input, port) {
    return { kind: 'read', output: read(readSchema.parse(input), port) }
  },
} satisfies ReadHandlerModule
