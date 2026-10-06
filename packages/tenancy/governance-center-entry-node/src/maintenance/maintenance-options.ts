import type {
  SnapshotCheck,
  SnapshotInspection,
  SnapshotMaintenance,
} from '@omne-harness-lite/storage'
import type { Clock } from '@omne-harness-lite/offer-expiry'

export interface SnapshotFormat {
  readonly migrationNames: readonly string[]
  readonly snapshotChecks: readonly SnapshotCheck[]
}

export interface MaintenanceDiagnostic {
  readonly event: 'maintenance-residual'
  readonly temporaryLocation: string
  readonly publishedLocation: string | null
}
export type MaintenanceReporter = (diagnostic: MaintenanceDiagnostic) => void

export interface OnlineMaintenanceOptions extends SnapshotFormat {
  readonly source: SnapshotMaintenance
  readonly clock: Clock
  readonly backupDirectory: string
  readonly workDirectory: string
  readonly sourceBuildId: string | null
  readonly report: MaintenanceReporter
  readonly onClosed: (status: 'clean' | 'error') => void
}
export interface OfflineMaintenanceOptions extends SnapshotFormat {
  readonly inspection: SnapshotInspection
  /** The same protected root passed when constructing inspection. */
  readonly workDirectory: string
  readonly report: MaintenanceReporter
}
