import type {
  RuntimeSessionAccess,
  CurrentHistoryReaders,
  RuntimeRecoveryAccess,
  ModelIdentitySource,
  AcknowledgementCleanupPolicy,
} from './service-types.ts'
import type { CallAccess, CallPresence } from './reference-types.ts'
import type {
  SettlementContention,
  SettlementScheduler,
  SettlementDiagnostic,
} from './settlement-types.ts'
import type { InvocationPolicy } from './invocation-types.ts'
import type { DiagnosticScope, DiagnosticAssociation } from './diagnostics-types.ts'
import type { DiagnosticEmitter } from './diagnostic-events.ts'

/** Trusted source ports, not authorization grants or serialized configuration. */
export interface ModelRuntimeHostInputs {
  readonly sessions: RuntimeSessionAccess
  readonly history: CurrentHistoryReaders
  readonly recovery: RuntimeRecoveryAccess
  readonly callAccess: CallAccess
  readonly callPresence: CallPresence
  readonly identities: ModelIdentitySource
}
/** One captured borrow; release does not cancel execution or acknowledge content. */
export interface ModelRuntimeHostLease {
  readonly generation: object
  readonly isCurrent: () => boolean
  readonly release: () => void
}
export interface ModelRuntimeHostInputOperations {
  readonly capture: () => {
    readonly inputs: ModelRuntimeHostInputs
    readonly lease: ModelRuntimeHostLease
  }
}
/** Engineering emitter only; journal/query/export are provider-specific capabilities. */
export interface ModelRuntimeDiagnosticEmitterFactory {
  readonly emitter: (
    scope: DiagnosticScope,
    association?: DiagnosticAssociation,
  ) => DiagnosticEmitter
}
export interface ModelRuntimeExecutionSupport {
  readonly settlementContention: SettlementContention
  readonly settlementScheduler: SettlementScheduler
  readonly policy: Omit<InvocationPolicy, 'diagnostic'> & {
    readonly diagnostic: (
      event: Parameters<InvocationPolicy['diagnostic']>[0] | SettlementDiagnostic,
    ) => void
  }
  readonly acknowledgementCleanup: AcknowledgementCleanupPolicy
  readonly diagnostic: (event: SettlementDiagnostic) => void
  readonly diagnosticCollector?: ModelRuntimeDiagnosticEmitterFactory
}
