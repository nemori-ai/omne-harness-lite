import { z } from 'zod'
import type { ReadPort, SqlValue } from '@omne-harness/sql-contract/worker'
export function record<T>(
  port: ReadPort,
  sql: string,
  params: readonly SqlValue[],
  schema: z.ZodType<T>,
): T | null {
  const row = port.execute(`${sql} LIMIT 1`, params).rows[0]
  return row === undefined ? null : schema.parse(JSON.parse(z.string().parse(row[0])))
}
export function records<T>(
  port: ReadPort,
  sql: string,
  params: readonly SqlValue[],
  schema: z.ZodType<T>,
): T[] {
  return port
    .execute(sql, params)
    .rows.map(row => schema.parse(JSON.parse(z.string().parse(row[0]))))
}
export function count(value: unknown): number {
  return z.coerce.number().int().nonnegative().parse(value)
}
