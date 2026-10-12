import type { ParameterJudge } from '@omne-harness-lite/tool-definition'
import type { SessionAccessOperations } from '@omne-harness-lite/session-tenancy'
import type { ToolPoolInstance } from './execution-pool.ts'
import type { RuntimeContextOperations } from '@omne-harness-lite/runtime-context'
import type {
  EnvironmentProviderRegistrations,
  ExecutionEnvironmentOperations,
  RecoveryAccess,
} from '@omne-harness-lite/execution-environments'
import type { ToolAdmissionOperations } from '@omne-harness-lite/tool-admission'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import type { InvokeTool, ToolImplementationOperations } from './tool-execution.ts'
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
/** An observed original close attempt; retained does not establish quiescence. */
export type ToolRuntimeCloseAttempt = RetainedCloseAttempt

/** Trusted host control for the original instance, independent of service visibility. */
export type ToolRuntimeCloseControl = RetainedCloseControl

/** The host retains control before waiting for runtime recovery. */
export interface ToolRuntimeStartupOperations {
  start(config: ToolRuntimeConfig): ToolPoolInstance
  retainClose(control: ToolRuntimeCloseControl): void
}

export interface ToolRuntimeDependencies {
  readonly parameters?: ParameterJudge

  readonly recovery: RecoveryAccess
  readonly authorization: SessionAccessOperations
  readonly admission: () => ToolAdmissionOperations | undefined
  readonly implementations: ToolImplementationOperations
  readonly context: Pick<RuntimeContextOperations, 'bind'>
  readonly environments: Pick<EnvironmentProviderRegistrations, 'recover' | 'recoverOwned'> &
    Pick<ExecutionEnvironmentOperations, 'resolvePlacement' | 'acquire'>
  readonly results: ToolResultStorageOperations
  readonly invoke: InvokeTool
  readonly clock: Clock
}
