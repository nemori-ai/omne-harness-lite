import type { HistoryEntry } from '@omne-harness/session-contract'
import type { JsonValue } from '@omne-harness/sql-contract'
import {
  unpackText,
  type HandlerOutcome,
  type ParticipantModule,
  type ParticipantReply,
  type ReadHandlerModule,
  type ReadPort,
  type SqlCell,
  type SqlValue,
} from '@omne-harness/sql-contract/worker'
import { StoredEntryMalformed } from '../entry-codec.ts'
import { PROTOCOL } from './schema.ts'

export const PAGE_ROWS = 200
// The bytes of one page of content: a page holds what fits, and always its first row.
export const PAGE_BYTES = 4 * 1024 * 1024

export function handler(
  name: string,
  read: (input: JsonValue, port: ReadPort) => JsonValue,
): ReadHandlerModule {
  return {
    handler: name,
    protocol: PROTOCOL,
    read(input, port): HandlerOutcome {
      try {
        return { kind: 'read', output: read(input, port) }
      } catch (error) {
        if (!(error instanceof StoredEntryMalformed)) throw error
        return { kind: 'read', output: { kind: 'malformed', diagnostic: error.message } }
      }
    },
  }
}

export function refusingMalformedEntries(module: ParticipantModule): ParticipantModule {
  return {
    participant: module.participant,
    protocol: module.protocol,
    execute(facts, port) {
      try {
        return module.execute(facts, port)
      } catch (error) {
        if (!(error instanceof StoredEntryMalformed)) throw error
        return { kind: 'failed', diagnostic: error.message }
      }
    },
  }
}

export type DefiniteFailure = 'read-bound' | 'execution-indexed' | 'missing-row' | 'quarantined'

export function definiteBasis(
  failure: DefiniteFailure,
  diagnostic: string,
): Readonly<{ failure: JsonValue; diagnostic: string }> {
  return { failure: { kind: 'invalid', field: 'storage', reason: failure }, diagnostic }
}

export const definite = (failure: DefiniteFailure, diagnostic: string): ParticipantReply => ({
  kind: 'conflict',
  basis: definiteBasis(failure, diagnostic),
})

export type Row = Readonly<Record<string, SqlCell>>
export type Executor = Readonly<{
  execute(
    sql: string,
    params: readonly SqlValue[],
  ): Readonly<{
    columns: readonly string[]
    rows: readonly (readonly SqlCell[])[]
    changes: bigint
  }>
}>

export function rowsOf(port: Executor, sql: string, params: readonly SqlValue[] = []): Row[] {
  const result = port.execute(sql, params)
  return result.rows.map(cells =>
    Object.fromEntries(result.columns.map((name, index) => [name, cells[index] ?? null])),
  )
}

export function oneRow(
  port: Executor,
  sql: string,
  params: readonly SqlValue[] = [],
): Row | undefined {
  return rowsOf(port, sql, params)[0]
}

export function text(cell: SqlCell | undefined): string {
  if (cell instanceof Uint8Array) throw new TypeError('a BLOB cell read as text')
  return String(cell)
}

export function packed(cell: SqlCell | undefined): string {
  if (!(cell instanceof Uint8Array)) throw new TypeError('a packed BLOB cell was expected')
  return unpackText(cell)
}
export const big = (cell: SqlCell | undefined): bigint => BigInt(cell as bigint | number | string)

export type Scope = Readonly<{ tenant: string; session: string }>

export function readVersion(
  port: Executor,
  scope: Scope,
): Readonly<{ tail: string; published: string }> | undefined {
  const row = oneRow(
    port,
    `SELECT j.tail AS tail, r.published AS published
       FROM sl_journal j
       LEFT JOIN er_root r ON r.tenant = j.tenant AND r.session = j.session
      WHERE j.tenant = ? AND j.session = ? LIMIT 1`,
    [scope.tenant, scope.session],
  )
  if (row === undefined) return undefined
  return {
    tail: text(row['tail']),
    published: row['published'] === null ? '0' : text(row['published']),
  }
}

export function assignPositions(
  port: Executor,
  scope: Scope,
  revision: string,
  entries: readonly object[],
): HistoryEntry[] {
  const key = [scope.tenant, scope.session]
  // A session without an entry of its own goes on after the position it forked at.
  const last = oneRow(
    port,
    `SELECT COALESCE((SELECT MAX(position) FROM sl_entry WHERE tenant = ? AND session = ?),
      (SELECT position FROM sl_fork WHERE tenant = ? AND session = ?), 0) AS p LIMIT 1`,
    [...key, ...key],
  )
  const first = big(last?.['p'] ?? 0n) + 1n
  return entries.map((entry, index) => ({
    ...entry,
    id: String(first + BigInt(index)),
    revision,
  })) as HistoryEntry[]
}

export function scopeOf(input: unknown): Scope | null {
  if (typeof input !== 'object' || input === null) return null
  const { tenant, session } = input as Record<string, unknown>
  return typeof tenant === 'string' &&
    tenant !== '' &&
    typeof session === 'string' &&
    session !== ''
    ? { tenant, session }
    : null
}
