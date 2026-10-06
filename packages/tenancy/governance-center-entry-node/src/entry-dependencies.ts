import type { EntryServices } from './service-faces.ts'
import type { AtomicStorage } from '@omne-harness-lite/storage'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import type { EntryOpeningSignal, ServingNotice } from '@omne-harness-lite/governance-center-entry'
import type { GovernanceCenterLogger } from './work.ts'

export interface EntryNotifications {
  serving(notice: ServingNotice): void
  stopped(): void
  defect(): void
  onListening(listener: () => void): () => void
}

export interface GovernanceCenterEntryDependencies {
  readonly storage: AtomicStorage
  readonly clock: Clock
  readonly services: EntryServices
  readonly opening: EntryOpeningSignal
  readonly logger: GovernanceCenterLogger
  readonly notifications: EntryNotifications
  isCurrent(): boolean
  isReadyToOpen(): boolean
}
