import type { JsonValue } from '@omne-harness/sql-contract'
import { unpackText, type SqlCell, type SqlValue } from '@omne-harness/sql-contract/worker'

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

export function text(cell: SqlCell | undefined): string {
  if (typeof cell !== 'string') throw new TypeError('a TEXT cell was expected')
  return cell
}

export function packed(cell: SqlCell | undefined): string {
  if (!(cell instanceof Uint8Array)) throw new TypeError('a BLOB cell was expected')
  return unpackText(cell)
}

export function integer(cell: SqlCell | undefined): string {
  if (typeof cell !== 'bigint' && typeof cell !== 'number')
    throw new TypeError('an INTEGER cell was expected')
  return String(cell)
}

export type JsonObject = Readonly<{ [key: string]: JsonValue }>

export function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function textOf(value: JsonObject, key: string): string | null {
  const member = value[key]
  return typeof member === 'string' && member !== '' ? member : null
}

export function countOf(value: JsonObject, key: string): number | null {
  const member = value[key]
  return typeof member === 'number' && Number.isSafeInteger(member) && member >= 0 ? member : null
}
