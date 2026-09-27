import { checkSnapshotTables, type SnapshotCheck } from '@omne-harness-lite/storage'
import { snapshotTables } from './registry-structure.ts'

export const STORAGE_SNAPSHOT_TABLES = Object.freeze(snapshotTables.map(table => table.name))
export const storageSnapshotCheck: SnapshotCheck = async view =>
  checkSnapshotTables(view, snapshotTables, 'storage-snapshot-registry-structure')
