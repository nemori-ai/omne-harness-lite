import { z } from 'zod'
import type { QueryRows } from '@omne-harness/sql-contract/worker'

export function record<T>(rows: QueryRows, schema: z.ZodType<T>): T | null {
  const row = rows.rows[0]
  if (row === undefined) return null
  return schema.parse(JSON.parse(z.string().parse(row[0])))
}
