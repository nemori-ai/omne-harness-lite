import { Service, type Context } from '@deepseek-ai/cordis'
import type { EntryOpeningSignal } from './index.ts'
import type { EntryMaintenanceResources } from './resources.ts'
import {
  SERVING_EVENT,
  STOPPED_EVENT,
  DEFECT_EVENT,
  LISTENING_EVENT,
  type ServingNotice,
} from './events.ts'

/** @owner packages/core/governance-center-entry */
export abstract class EntryOpening extends Service implements EntryOpeningSignal {
  static readonly provide = 'entryOpening' as const
  constructor(ctx: Context) {
    super(ctx, EntryOpening.provide)
  }
  abstract wait: EntryOpeningSignal['wait']
  abstract isOpen: EntryOpeningSignal['isOpen']
}
export const ENTRY_OPENING_SERVICE = EntryOpening.provide

/** @owner packages/core/governance-center-entry */
export abstract class EntryMaintenance extends Service implements EntryMaintenanceResources {
  static readonly provide = 'entryMaintenance'
  constructor(ctx: Context) {
    super(ctx, EntryMaintenance.provide)
  }
  abstract readonly snapshotChecks: EntryMaintenanceResources['snapshotChecks']
  abstract closed: EntryMaintenanceResources['closed']
}
export const ENTRY_MAINTENANCE_SERVICE = EntryMaintenance.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    entryOpening: EntryOpening
    entryMaintenance: EntryMaintenance
  }
  interface Events {
    /** @mode emit @param notice The confirmed center and its serving clock observation. */
    [SERVING_EVENT](notice: ServingNotice): void
    /** @mode emit Emitted when entry admission stops. */
    [STOPPED_EVENT](): void
    /** @mode emit Emitted for each observed entry defect. */
    [DEFECT_EVENT](): void
    /** @mode emit Emitted after the operations listener is installed. */
    [LISTENING_EVENT](): void
  }
}
