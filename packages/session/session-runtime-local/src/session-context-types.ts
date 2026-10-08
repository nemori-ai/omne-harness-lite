import type { Storage } from '@omne-harness-lite/storage'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import type { SessionLogBackingOperations } from '@omne-harness-lite/session-log'
import type { SessionAccessOperations, SessionScope } from '@omne-harness-lite/session-tenancy'
import type {
  RuntimeContextOperations,
  ContextSourceRegistrations,
  ContextSessionInitializer,
} from '@omne-harness-lite/runtime-context'
import type {
  AssemblyCloseReport,
  RetainedCloseAttempt,
} from '@omne-harness-lite/assembly-lifecycle'

/** Trusted construction after actual definition/recipe resolution. These references are not plugin configuration. */
export interface SessionContextOptions {
  readonly scope: SessionScope
  readonly storage: Storage
  readonly logBacking: SessionLogBackingOperations
  readonly access: SessionAccessOperations
  readonly clock: Clock
}
/** A distinct Session Context with owned Runtime Context and explicit borrowed bridges. */
export interface LocalSessionContext {
  readonly scope: SessionScope
  readonly ready: Promise<RuntimeContextOperations & ContextSourceRegistrations>
  readonly initializer: ContextSessionInitializer
  /** Withdraws new work synchronously. This action does not cancel process-owned model/tool executions. */
  readonly requestStop: () => void
  readonly closed: Promise<AssemblyCloseReport>
  /** Observe/retry the same original close after requestStop; never reopen admission. */
  readonly closeAttempt: () => Promise<RetainedCloseAttempt | 'notStopping'>
  readonly retryClose: () => Promise<RetainedCloseAttempt | 'notStopping'>
}
