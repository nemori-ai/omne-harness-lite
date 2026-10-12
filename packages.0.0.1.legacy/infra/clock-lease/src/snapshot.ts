import { sql } from 'kysely'
import { checkSnapshotTables, type SnapshotCheck } from '@omne-harness-lite/storage'
import { snapshotTables } from './snapshot-structure.ts'

export const CLOCK_SNAPSHOT_TABLES = Object.freeze(snapshotTables.map(table => table.name))
export const clockSnapshotCheck: SnapshotCheck = async view => {
  const structure = checkSnapshotTables(view, snapshotTables, 'clock-snapshot-structure')
  if (!structure.ok) return structure
  // Bound corrupt scalar values before passing them across the native JS boundary.
  const { rows } = await sql<{
    id: string
    until: string
    written: string
    idType: string
    untilType: string
    writtenType: string
  }>`SELECT
    typeof(id) AS idType,typeof(lease_until) AS untilType,typeof(written_at) AS writtenType,
    substr(cast(id as text),1,32) AS id,
    substr(cast(lease_until as text),1,32) AS until,
    substr(cast(written_at as text),1,32) AS written FROM clock_lease LIMIT 2`.execute(
    view.inspection.tx.db,
  )
  // This is the legacy business table. The independent clock floor is in backup metadata.
  if (rows.length === 0) return { ok: true }
  const row = rows[0]
  const until = Number(row?.until)
  const written = Number(row?.written)
  if (
    rows.length !== 1 ||
    row?.id !== '1' ||
    row.idType !== 'integer' ||
    row.untilType !== 'integer' ||
    row.writtenType !== 'integer' ||
    !Number.isSafeInteger(until) ||
    !Number.isSafeInteger(written) ||
    written > until
  )
    return {
      ok: false,
      check: 'clock-snapshot-floor',
      detail: 'snapshot clock floor is missing or malformed',
    }
  return { ok: true }
}
