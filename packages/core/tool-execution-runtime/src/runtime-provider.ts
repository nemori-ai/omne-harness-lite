import type {
  SessionLogBackingOperations,
  SessionLogOwnerOperations,
} from '@omne-harness-lite/session-log'
import type { SessionAccessOperations } from '@omne-harness-lite/session-tenancy'
import type { RuntimeContextOperations } from '@omne-harness-lite/runtime-context'
import type {
  EnvironmentProviderRegistrations,
  RecoveryAccess,
} from '@omne-harness-lite/execution-environments'
import type {
  ToolActionHistoryOperations,
  ToolAdmissionOperations,
} from '@omne-harness-lite/tool-admission'
import type { RunnerServiceHost } from '@omne-harness-lite/loop-extension-runner'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import type {
  InvokeTool,
  ToolImplementationOperations,
  ToolRuntimeOperations,
} from './tool-execution.ts'
import type { ToolResultStorageOperations } from './tool-results.ts'
import type {
  RetainedCloseAttempt,
  RetainedCloseControl,
} from '@omne-harness-lite/assembly-lifecycle'

/** Only active policies belong to the serializable provider configuration. */
export interface ToolRuntimeConfig {
  readonly frameQueueBytes: number
  readonly tailRetry: {
    readonly attempts: number
    readonly minDelayMs: number
    readonly maxDelayMs: number
  }
  readonly resultStorage: string
}
/** Private maintenance authority is a bootstrap input, never plugin configuration or a tool capability. */
export interface ToolRuntimeBootstrap {
  readonly recovery: RecoveryAccess
}
/** An observed original close attempt; retained does not establish quiescence. */
export type ToolRuntimeCloseAttempt = RetainedCloseAttempt

/** Trusted host control for the original instance, independent of service visibility. */
export type ToolRuntimeCloseControl = RetainedCloseControl

/** The host retains control before waiting for runtime recovery. */
export interface ToolRuntimeStartupOperations {
  recoveryAccess(): ToolRuntimeBootstrap['recovery']
  retainClose(control: ToolRuntimeCloseControl): void
}

export interface ToolRuntimeDependencies extends ToolRuntimeBootstrap {
  readonly backing: SessionLogBackingOperations
  readonly owner: SessionLogOwnerOperations
  readonly history: ToolActionHistoryOperations
  readonly authorization: SessionAccessOperations
  readonly admission: () => ToolAdmissionOperations | undefined
  readonly implementations: ToolImplementationOperations
  readonly context: Pick<RuntimeContextOperations, 'bind'>
  readonly environments: Pick<EnvironmentProviderRegistrations, 'recover'>
  readonly results: ToolResultStorageOperations
  readonly runnerHost: RunnerServiceHost
  readonly invoke: InvokeTool
  readonly clock: Clock
}
export interface ToolRuntimeInstance {
  readonly operations: ToolRuntimeOperations
  /** Resolves only after every owned session has been scanned and recovery obligations have settled. */
  readonly ready: Promise<void>
  readonly idle: () => Promise<void>
  /** Does not close the shared physical log, result storage, context or environment providers. */
  readonly close: () => Promise<void>
}
