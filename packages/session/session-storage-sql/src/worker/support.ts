// Shared by the Worker modules: row access over the statement ports, and the handler input check.
import type { HistoryEntry } from '@omne-harness/session-contract'
import type { JsonValue } from '@omne-harness/sql-contract'
import type {
  HandlerOutcome,
  ParticipantModule,
  ParticipantReply,
  ReadHandlerModule,
  ReadPort,
  SqlCell,
  SqlValue,
} from '@omne-harness/sql-contract/worker'
import { StoredEntryMalformed } from '../entry-codec.ts'
import { PROTOCOL } from './schema.ts'

/** The upper bound of rows of one page. Every handler statement carries its own LIMIT. */
export const PAGE_ROWS = 200

/**
 * A read handler. A stored `entry` text that does not read answers `{ kind: 'malformed',
 * diagnostic }`, which the port answers as `unavailable` with the diagnostic (`readHandler`): a
 * throw would reach the port as `read_failed` without it.
 */
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

/**
 * A participant whose commit fails, with the diagnostic, on a stored `entry` text that does not
 * read: the reply `failed` stops the transaction, where a throw would lose the diagnostic.
 */
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

/** The class names of the definite failures of the `session` participant (SPEC 参加者失败的定性). */
export type DefiniteFailure = 'read-bound' | 'execution-indexed' | 'missing-row' | 'quarantined'

/**
 * The basis of a definite failure: the Session failure `invalid` on the field `storage`, named by
 * its class, which the port returns as it is, and the diagnostic beside it for the rolled back
 * receipt. Waiting does not change such a failure, so it is a conflict and never `failed`.
 */
export function definiteBasis(
  failure: DefiniteFailure,
  diagnostic: string,
): Readonly<{ failure: JsonValue; diagnostic: string }> {
  return { failure: { kind: 'invalid', field: 'storage', reason: failure }, diagnostic }
}

/** The participant reply of a definite failure: a conflict on `definiteBasis`. */
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

export const text = (cell: SqlCell | undefined): string => String(cell)
export const big = (cell: SqlCell | undefined): bigint => BigInt(cell as bigint | number | string)

/** The tenant and session that every statement of a handler is bound to. */
export type Scope = Readonly<{ tenant: string; session: string }>

/**
 * The version of the `readWork` answer of one session (SPEC RT-04): the Session tail and the Agent
 * publication count, by two primary-key point reads. A session without an Agent publication has
 * the count `0`. Undefined when no session of the tenant has the name.
 */
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

/**
 * The entries of a batch at the positions after the last entry of the session, all of `revision`:
 * the ids that the rows, the receipt and the reduction of the batch use.
 */
export function assignPositions(
  port: Executor,
  scope: Scope,
  revision: string,
  entries: readonly object[],
): HistoryEntry[] {
  const last = oneRow(
    port,
    'SELECT COALESCE(MAX(position), 0) AS p FROM sl_entry WHERE tenant = ? AND session = ? LIMIT 1',
    [scope.tenant, scope.session],
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
