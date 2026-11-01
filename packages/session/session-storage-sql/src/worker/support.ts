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
  execute(sql: string, params: readonly SqlValue[]): Readonly<{
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
export function scopeOf(input: unknown): { tenant: string; session: string } | null {
  if (typeof input !== 'object' || input === null) return null
  const { tenant, session } = input as Record<string, unknown>
  return typeof tenant === 'string' && tenant !== '' && typeof session === 'string' && session !== ''
    ? { tenant, session }
    : null
}
