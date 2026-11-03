// Shared by the Worker modules: row access over the statement ports, and the handler input check.
import type { JsonValue } from '@omne-harness/sql-contract'
import type {
  HandlerOutcome,
  ReadHandlerModule,
  ReadPort,
  SqlCell,
  SqlValue,
} from '@omne-harness/sql-contract/worker'
import { PROTOCOL } from './schema.ts'

/** The upper bound of rows of one page. Every handler statement carries its own LIMIT. */
export const PAGE_ROWS = 200

export function handler(
  name: string,
  read: (input: JsonValue, port: ReadPort) => JsonValue,
): ReadHandlerModule {
  return {
    handler: name,
    protocol: PROTOCOL,
    read(input, port): HandlerOutcome {
      return { kind: 'read', output: read(input, port) }
    },
  }
}

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
