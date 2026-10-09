import type {
  SettlementCoordinatorBinding,
  SettlementContention,
  SettlementScheduler,
  SettlementDiagnostic,
} from '@omne-harness-lite/model-request-runtime'

export interface SettlementCoordinatorInput extends SettlementCoordinatorBinding {
  /** Entire missing policy/scheduler port makes this progression unavailable. No fallback. */
  readonly settlementContention?: SettlementContention
  readonly settlementScheduler?: SettlementScheduler
  readonly diagnostic: (event: SettlementDiagnostic) => void
}

export type {
  SettlementCoordinator,
  SettlementHandle,
  SettlementRequest,
  SettlementStagedBatch,
  SettlementStaging,
} from '@omne-harness-lite/model-request-runtime'
