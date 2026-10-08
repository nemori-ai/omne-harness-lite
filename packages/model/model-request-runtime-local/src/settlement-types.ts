import type {
  RunHistoryReader,
  SettlementLogBinding,
  SettlementTask,
  SettlementOwner,
  SettlementContention,
  SettlementScheduler,
  SettlementDiagnostic,
  SettlementResult,
} from '@omne-harness-lite/model-request-runtime'

import type { AppendCondition, OwnedLogEntry } from '@omne-harness-lite/session-log'
import type {
  OriginalIssueAdmission,
  ModelLogSettlementTarget,
  ModelLogSettlementCurrent,
} from '@omne-harness-lite/model-request-runtime'

export interface SettlementCoordinatorInput {
  readonly binding: SettlementLogBinding
  readonly owner: SettlementOwner
  /** Absent G28 source prevents only a new withRun settlement, never original-batch recognition. */
  readonly run?: RunHistoryReader
  /** Entire missing policy/scheduler port makes this progression unavailable. No fallback. */
  readonly settlementContention?: SettlementContention
  readonly settlementScheduler?: SettlementScheduler
  readonly diagnostic: (event: SettlementDiagnostic) => void
}

export interface SettlementRequest {
  readonly target: ModelLogSettlementTarget
  readonly current: ModelLogSettlementCurrent | null
  /** Complete declared response. Snapshot is captured before any asynchronous work. */
  readonly response: unknown
  /**
   * RT12 S-99⑧: when present, every batch is durably held here before its append may take
   * effect. Absent keeps the original pre-ACK behaviour, where the runtime holds the source.
   */
  readonly staging?: SettlementStaging
}

/** RT12 S-99⑧: the exact batch one settlement is about to append, with its identity. */
export interface SettlementStagedBatch {
  readonly target: ModelLogSettlementTarget
  readonly current: ModelLogSettlementCurrent | null
  readonly entries: readonly OwnedLogEntry[]
  readonly condition: AppendCondition
}

/**
 * The coordinator calls `hold` only while no earlier append of the same request can still take
 * effect: first before the initial append, then after a proven zero write (`tailChanged` or
 * `alreadyRecorded`) before a rebuilt batch. It never calls it while a receipt is unknown.
 */
export interface SettlementStaging {
  readonly hold: (
    batch: SettlementStagedBatch,
  ) => Promise<{ readonly held: true } | { readonly unavailable: true }>
}

export interface SettlementHandle extends SettlementTask<SettlementResult> {}

export interface SettlementCoordinator {
  /**
   * A handle that stops with an unknown append receipt keeps its registration and exact batch.
   * A later settle for the same target resolves that original handle from a same-source full
   * prefix and writes nothing itself: a complete batch is recognized; proven absence releases
   * the original and returns `write_unknown`, after which another settle may submit again.
   */
  readonly settle: (request: SettlementRequest) => SettlementHandle
  /**
   * Close admission, request stop and actively resolve retained unknown originals. Completes only
   * when all owned tasks actually stopped and every registration was released; otherwise it
   * rejects and the retained work stays owned for a later close.
   */
  readonly close: () => Promise<void>
}
