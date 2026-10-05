import {
  checkSnapshotTables,
  narrow,
  SnapshotFailure,
  type SnapshotCheck,
  type SnapshotView,
} from '@omne-harness-lite/storage'
import { GOVERNANCE_CENTER_TABLE, type GovernanceCenterTable } from './table.ts'
import {
  isGovernanceCenterId,
  type GovernanceCenterId,
} from '@omne-harness-lite/governance-center-entry'
import { snapshotTables } from './snapshot-structure.ts'

export const CENTER_SNAPSHOT_TABLES = Object.freeze(snapshotTables.map(table => table.name))
async function identity(view: SnapshotView): Promise<GovernanceCenterId | undefined> {
  const rows = await narrow<GovernanceCenterTable>(view.inspection.tx)
    .selectFrom(GOVERNANCE_CENTER_TABLE)
    .select(eb => [
      eb.fn<string>('substr', ['slot', eb.val(1), eb.val(7)]).as('slot'),
      eb.fn<number>('length', ['slot']).as('slotLength'),
      eb.fn<string | null>('substr', ['center_id', eb.val(1), eb.val(33)]).as('id'),
      eb.fn<number | null>('length', ['center_id']).as('idLength'),
    ])
    .limit(2)
    .execute()
  const row = rows[0]
  if (
    rows.length !== 1 ||
    row?.slot !== 'center' ||
    row.slotLength !== 6 ||
    row.idLength !== 32 ||
    !isGovernanceCenterId(row.id)
  )
    return undefined
  return row.id
}
export const governanceCenterSnapshotCheck: SnapshotCheck = async view => {
  const structure = checkSnapshotTables(view, snapshotTables, 'center-snapshot-structure')
  if (!structure.ok) return structure
  if ((await identity(view)) === undefined)
    return {
      ok: false,
      check: 'center-snapshot-identity',
      detail: 'snapshot center identity is missing or malformed',
    }
  return { ok: true }
}
export async function readSnapshotCenterId(view: SnapshotView): Promise<GovernanceCenterId> {
  if (!checkSnapshotTables(view, snapshotTables, 'center-snapshot-structure').ok)
    throw new SnapshotFailure('invalid-data')
  const id = await identity(view)
  if (id === undefined) throw new SnapshotFailure('invalid-data')
  return id
}
