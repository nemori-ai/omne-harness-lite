import { checkSnapshotTables, type SnapshotCheck } from '@omne-harness-lite/storage'
import { snapshotTables } from './snapshot-structure.ts'

export const ACCOUNT_SNAPSHOT_TABLES = Object.freeze(snapshotTables.map(table => table.name))
export const accountIdentitySnapshotCheck: SnapshotCheck = async view =>
  checkSnapshotTables(view, snapshotTables, 'account-snapshot-structure')
