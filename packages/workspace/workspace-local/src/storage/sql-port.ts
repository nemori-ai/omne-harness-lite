import type { QueryRows, SqlValue } from '@omne-harness/sql-contract/worker'
import { ROW_LIMIT } from './schema.ts'

/** What both the participant and the read handler are given: one statement at a time, inside one transaction. */
export type SqlPort = Readonly<{ execute(sql: string, params: readonly SqlValue[]): QueryRows }>

/** A result that reaches past the row limit fails instead of being cut. */
export function select(
  port: SqlPort,
  sql: string,
  params: readonly SqlValue[],
  limit = ROW_LIMIT,
): QueryRows['rows'] {
  const found = port.execute(`${sql} LIMIT ${limit + 1}`, params).rows
  if (found.length > limit) throw new Error('more rows than one statement may return')
  return found
}

export function text(cell: unknown): string {
  if (typeof cell !== 'string') throw new Error('a stored text cell is not text')
  return cell
}

/** The storage worker reads every integer as a bigint. */
export function count(cell: unknown): number {
  if (typeof cell !== 'bigint') throw new Error('a stored integer cell is not an integer')
  return Number(cell)
}
