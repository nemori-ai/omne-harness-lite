import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type { AttemptId, RunId } from '@omne-harness-lite/call-accounts'
import type { TenantId } from '@omne-harness-lite/identity-values'
import type { SessionRef } from '@omne-harness-lite/messages'
import type {
  SourceToken,
  LogEntry,
  AppendCondition,
  AppendResult,
  OwnedLogEntry,
  SessionLog,
} from '@omne-harness-lite/session-log'
import type {
  OriginalIssueAdmission,
  ModelLogSettlementTarget,
  ModelLogSettlementCurrent,
  SettlementMembersResult,
} from '@omne-harness-lite/model-request-runtime'
import type { SettlementPrefix } from './settlement-prefix.ts'

/** G28's owner interprets both axes from the exact owned prefix supplied by this coordinator. */
export type RunHistoryReader = (
  prefix: SettlementPrefix,
  originalRun: RunId,
  originalAttempt: AttemptId,
) =>
  | {
      readonly known: {
        readonly run: RunId
        readonly originalAttempt: AttemptId
        readonly latestAttempt: AttemptId
        readonly terminal: 'open' | 'ended'
      }
    }
  | { readonly unavailable: true }

/** Actual access and lifetime are established by the host, not certified by this shape. */
export interface SettlementLogBinding {
  readonly session: SessionRef
  readonly tenant: TenantId
  readonly log: SessionLog
  /** Bound current-authorized complete prefix, with its persisted journal identity. */
  readonly readPrefix?: () => Promise<
    | {
        readonly entries: readonly LogEntry[]
        readonly tail: JsonNumber
        readonly source: SourceToken
      }
    | { readonly failure: 'unavailable' }
  >
  readonly originalIssue?: OriginalIssueAdmission
  readonly generation: object
  /** Same generation object while usable; null after revocation/replacement. No authorization flag. */
  readonly currentGeneration: () => object | null
}
export interface SettlementTask<T> {
  readonly completion: Promise<T>
  readonly requestStop: () => void
  /** Actual effect-capable operation and its resources have stopped, independently of completion. */
  readonly stopped: Promise<void>
}
/** Control appends retain their own unknown-write responsibility; append is a response writer. */
export type SettlementTaskKind = 'read' | 'append' | 'controlAppend' | 'wait'
export interface SettlementRegistration {
  /** Register synchronously before invoking operation; retain it until actual stopped. */
  readonly start: <T>(
    kind: SettlementTaskKind,
    operation: (signal: AbortSignal) => Promise<T>,
  ) => SettlementTask<T>
  /** Called once after actual stop; an unknown append additionally needs same-source full-prefix recognition. */
  readonly release: () => void
}
export interface SettlementOwner {
  readonly name: string
  readonly admission: () => 'open' | 'closed'
  /** Atomic same-owner concurrency admission; no hidden queue. */
  readonly acquire: (
    limit: JsonNumber,
  ) => { readonly registration: SettlementRegistration } | { readonly unavailable: true }
  /** The original opened receipt; unknown blocks every ordinary response entry. */
  readonly opened: () =>
    { readonly confirmed: true } | { readonly unknown: SettlementTask<unknown> }
  /** All still unresolved old response writers, including completed-but-unconfirmed receipts. */
  readonly unresolvedWrites: () => readonly SettlementTask<AppendResult>[]
}
export interface SettlementContention {
  readonly name: string
  readonly limits: {
    readonly submissions: JsonNumber
    readonly elapsedMs: JsonNumber
    readonly retainedBytes: JsonNumber
    readonly concurrent: JsonNumber
  }
  readonly decide: (input: {
    readonly stage: 'initial' | 'tailChanged' | 'collision'
    readonly submissions: JsonNumber
    readonly tailConflicts: JsonNumber
    readonly elapsedMs: JsonNumber
    readonly retainedBytes: JsonNumber
    readonly previousWaitMs: JsonNumber
  }) => { readonly stop: true } | { readonly proceed: { readonly waitMs: JsonNumber } }
}
export interface SettlementScheduler {
  readonly nowMonotonicMs: () => JsonNumber
  readonly wait: (
    waitMs: JsonNumber,
    signal: AbortSignal,
  ) => SettlementTask<'elapsed' | 'cancelled'>
}
export interface SettlementDiagnostic {
  readonly kind: string
  readonly tenant: TenantId
  readonly session: SessionRef
  readonly call: string
  readonly dispatch: JsonNumber
  readonly response: string
  readonly owner: string
  readonly policy: string
  readonly submissions: JsonNumber
  readonly tailConflicts: JsonNumber
}
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
export type SettlementComplete = Extract<
  SettlementMembersResult,
  { readonly completeMembers: unknown }
>['completeMembers']
export type SettlementUnavailableReason =
  | 'dependency'
  | 'policy'
  | 'closed'
  | 'concurrent'
  | 'budget'
  | 'cancelled'
  | 'generation'
  | 'log'
  | 'prefix'
  | 'anchor'
  | 'members'
  | 'run_history_unavailable'
  | 'opened_unknown'
  | 'write_unknown'
  | 'task'
  | 'candidate'
  /** The batch could not be durably held before its append (RT12 S-99⑧); nothing was sent. */
  | 'staging'
export type SettlementResult =
  | { readonly settled: SettlementComplete; readonly origin: 'appended' | 'recognized' }
  | { readonly unavailable: true; readonly reason: SettlementUnavailableReason }
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
