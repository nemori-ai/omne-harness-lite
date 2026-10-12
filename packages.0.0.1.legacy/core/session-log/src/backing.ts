import type { SessionLog } from './types.ts'

/** Trusted assembly input. This is neither a user authorization port nor a tool dependency. */
export interface SessionLogBackingOperations {
  /** Identity of the physical owner's lifetime, shared by all adapters and borrows. */
  readonly ownerGeneration: string
  readonly borrow: () => {
    readonly log: SessionLog
    /** Closes admission even on failure; unresolved writes retain the borrow. Retry is permitted. */
    readonly release: () => Promise<void>
  }
}
