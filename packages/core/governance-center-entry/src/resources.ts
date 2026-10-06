import type { SnapshotCheck } from '@omne-harness-lite/storage'

/** The host retains this port until the entry assembly has actually closed. */
export interface EntryMaintenanceResources {
  readonly snapshotChecks: readonly SnapshotCheck[]
  closed(status: 'clean' | 'error'): void
}
