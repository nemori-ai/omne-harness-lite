import type { Clock } from '@omne-harness-lite/offer-expiry'
import type { Storage, SnapshotMaintenance } from '@omne-harness-lite/storage'
import type {
  EntryOpeningSignal,
  EntryMaintenanceResources,
  ServingNotice,
} from '@omne-harness-lite/governance-center-entry'
import type { GovernanceCenterLogger } from '../work.ts'

export interface OpsNotifications {
  listening(): void
  onServing(listener: (notice: ServingNotice) => void): () => void
  onStopped(listener: () => void): () => void
  onDefect(listener: () => void): () => void
}

export interface GovernanceCenterOpsDependencies {
  readonly storage: Storage & { readonly maintenance: SnapshotMaintenance }
  readonly clock: Clock
  readonly opening: EntryOpeningSignal
  readonly maintenance: EntryMaintenanceResources
  readonly logger: GovernanceCenterLogger
  readonly notifications: OpsNotifications
  isCurrent(): boolean
}
