// Shared by the Worker modules: row access over the statement ports, and the parse of the JSON
// values that cross into a Worker module. A value that does not parse is refused by the caller.
import type { JsonValue } from '@omne-harness/sql-contract'
import type { SqlCell, SqlValue } from '@omne-harness/sql-contract/worker'

export type Row = Readonly<Record<string, SqlCell>>

export type Executor = Readonly<{
  execute(
    sql: string,
    params: readonly SqlValue[],
  ): Readonly<{ columns: readonly string[]; rows: readonly (readonly SqlCell[])[] }>
}>

export function rowsOf(port: Executor, sql: string, params: readonly SqlValue[]): Row[] {
  const result = port.execute(sql, params)
  return result.rows.map(cells =>
    Object.fromEntries(result.columns.map((name, index) => [name, cells[index] ?? null])),
  )
}

export function oneRow(port: Executor, sql: string, params: readonly SqlValue[]): Row | undefined {
  return rowsOf(port, sql, params)[0]
}

/** The text of a TEXT cell; any other cell is a schema fault, so it throws. */
export function text(cell: SqlCell | undefined): string {
  if (typeof cell !== 'string') throw new TypeError('a TEXT cell was expected')
  return cell
}

/** The decimal text of an INTEGER cell (read as BigInt by the provider). */
export function integer(cell: SqlCell | undefined): string {
  if (typeof cell !== 'bigint' && typeof cell !== 'number')
    throw new TypeError('an INTEGER cell was expected')
  return String(cell)
}

export type JsonObject = Readonly<{ [key: string]: JsonValue }>

export function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A non-empty string member of `value`, or null. */
export function textOf(value: JsonObject, key: string): string | null {
  const member = value[key]
  return typeof member === 'string' && member !== '' ? member : null
}

/** A non-negative safe integer member of `value`, or null. */
export function countOf(value: JsonObject, key: string): number | null {
  const member = value[key]
  return typeof member === 'number' && Number.isSafeInteger(member) && member >= 0 ? member : null
}
