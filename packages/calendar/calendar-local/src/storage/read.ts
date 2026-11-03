import { z } from 'zod'
import type { ReadHandlerModule, ReadPort, SqlValue } from '@omne-harness/sql-contract/worker'
import type { JsonValue } from '@omne-harness/sql-contract'
import { HANDLER, PROTOCOL, readSchema, type RepositoryRead } from './schema.ts'

function one(port: ReadPort, sql: string, params: readonly SqlValue[]): JsonValue {
  const row = port.execute(`${sql} LIMIT 1`, params).rows[0]
  return row === undefined ? null : z.json().parse(JSON.parse(z.string().parse(row[0])))
}
function page(port: ReadPort, sql: string, params: readonly SqlValue[], limit: number): JsonValue {
  const rows = port.execute(sql, params).rows
  const selected = rows.slice(0, limit)
  const last = selected.at(-1)
  return {
    items: selected.map(row => z.json().parse(JSON.parse(z.string().parse(row[1])))),
    nextCursor: rows.length > limit && last !== undefined ? String(last[0]) : null,
  }
}
function read(input: RepositoryRead, port: ReadPort): JsonValue {
  switch (input.kind) {
    case 'snapshot':
      return input.version.kind === 'current'
        ? one(
            port,
            'SELECT v.snapshot FROM ca_current c JOIN ca_versions v ON v.calendar_id = c.calendar_id AND v.version_id = c.version_id WHERE c.calendar_id = ?',
            [input.calendarId],
          )
        : one(port, 'SELECT snapshot FROM ca_versions WHERE calendar_id = ? AND version_id = ?', [
            input.calendarId,
            input.version.versionId,
          ])
    case 'candidate':
      return one(port, 'SELECT record FROM ca_candidates WHERE operation_ref = ?', [
        input.candidateRef,
      ])
    case 'operation':
      return one(port, 'SELECT record FROM ca_candidates WHERE operation_ref = ?', [
        input.operationRef,
      ])
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
        'SELECT sequence, record FROM ca_candidates WHERE calendar_id = ? AND sequence > ? ORDER BY sequence LIMIT ?',
        [input.calendarId, cursor(input.after), input.limit + 1],
        input.limit,
      )
    case 'reactions':
      return page(
        port,
        'SELECT sequence, record FROM ca_outbox WHERE handoff_ref IS NULL AND sequence > ? ORDER BY sequence LIMIT ?',
        [cursor(input.after), input.limit + 1],
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
