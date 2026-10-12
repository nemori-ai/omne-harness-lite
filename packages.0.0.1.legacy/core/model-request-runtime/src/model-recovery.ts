import type { AcknowledgedCallFacts, AcknowledgedCallView } from './reference-types.ts'
import type { DiagnosticEmitterSource } from './operation-diagnostics.ts'
import type {
  ModelSettlementWorkRetirement,
  SessionModelSettlement,
  SettlementWorkRecovery,
} from './model-settlement.ts'
import type { SessionModelRequestPreparation } from './session-request-preparation.ts'
import type {
  ReconcileInput,
  ReconcileResult,
  RuntimeRecoveryAccess,
  RuntimeSessionAccess,
  ServiceUnavailable,
  SessionRuntimeBinding,
  SettleReplyInput,
  SettleReplyResult,
} from './service-types.ts'
import type {
  RunHistoryReader,
  SettlementContention,
  SettlementDiagnostic,
  SettlementLogBinding,
  SettlementScheduler,
} from './settlement-types.ts'

export interface SessionModelRecoveryInput {
  readonly settlementFactory: Pick<SessionModelSettlement, 'create' | 'recoverWork'>
  readonly readCall: SessionModelRequestPreparation['readCall']
  readonly recovery: RuntimeRecoveryAccess
  readonly run?: RunHistoryReader
  readonly contention: SettlementContention
  readonly scheduler: SettlementScheduler
  readonly now: () => Promise<string>
  readonly diagnostic: (event: SettlementDiagnostic) => void
  readonly diagnosticCollector?: DiagnosticEmitterSource
  readonly onDiagnosticFailure?: () => void
  readonly custody: {
    readonly view: (
      binding: SettlementLogBinding,
      facts: AcknowledgedCallFacts,
    ) => Promise<AcknowledgedCallView | ServiceUnavailable>
    readonly retireWork: ModelSettlementWorkRetirement
  }
  readonly settlementWork?: SettlementWorkRecovery
}

/** Views share the original recovery tasks and retryable close state. */
export interface SessionModelReconciler {
  readonly reconcile: (request: ReconcileInput) => Promise<ReconcileResult>
  readonly close: () => Promise<{ readonly released: true } | { readonly unavailable: true }>
  readonly project: (input: SessionModelRecoveryInput) => SessionModelReconciler
}

export type SessionModelReplyRecognition = (
  request: SettleReplyInput,
  input: { readonly sessions: RuntimeSessionAccess; readonly contention: SettlementContention },
  boundSession?: SessionRuntimeBinding,
) => Promise<SettleReplyResult>
