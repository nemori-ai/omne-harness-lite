import { z } from 'zod'
import snapshot from './aa-rows.json' with { type: 'json' }
import type { RowId, ServiceName, Visibility } from '../types.ts'

const rowKey = z.string().regex(/^[a-z0-9][a-z0-9-]*$/)

/** Shape of the generated snapshot of the AA plugin-tree table (scripts/aa-rows.mjs). */
const SnapshotSchema = z.strictObject({
  source: z.string(),
  rows: z.array(rowKey).refine(rows => new Set(rows).size === rows.length, 'duplicate row id'),
  trusted: z.array(z.strictObject({ row: rowKey, names: z.array(z.string()).min(1) })).nullable(),
})

const parsed = SnapshotSchema.parse(snapshot)
for (const entry of parsed.trusted ?? []) {
  if (!parsed.rows.includes(entry.row)) throw new Error(`trusted row "${entry.row}" is not a row`)
}

/** Row ids in AA order. AA owns them; this list is regenerated, never edited. */
export const rowIds: readonly RowId[] = parsed.rows.map(id => id as RowId)

/** Trusted names per row, as formal keys. Empty while AA has no trusted-subtree table. */
export const trustedScopes: readonly Readonly<{ row: RowId; names: readonly string[] }>[] = (
  parsed.trusted ?? []
).map(entry => ({ row: entry.row as RowId, names: entry.names }))

/** Visibility for the loader, with the S0 private prefix on every name. */
export const visibility: Visibility = new Map<RowId, readonly ServiceName[]>(
  trustedScopes.map(scope => [scope.row, scope.names.map(name => `s0.${name}`)]),
)
