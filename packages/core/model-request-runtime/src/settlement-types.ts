import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type { AttemptId, RunId } from '@omne-harness-lite/call-accounts'
import type { TenantId } from '@omne-harness-lite/identity-values'
import type { SessionRef } from '@omne-harness-lite/messages'
import type { OriginalIssueAdmission } from './original-issue.ts'
import type {
  SourceToken,
  LogEntry,
  AppendResult,
  AppendCondition,
  OwnedLogEntry,
  SessionLog,
} from '@omne-harness-lite/session-log'
import type {
  SettlementMembersResult,
  ModelLogSettlementTarget,
  ModelLogSettlementCurrent,
} from './log-codec-settlement.ts'
import type { SettlementPrefix } from './index.ts'

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

export interface SettlementRequest {
  readonly target: ModelLogSettlementTarget
  readonly current: ModelLogSettlementCurrent | null
  /** Complete declared response. Snapshot is captured before any asynchronous work. */
  readonly response: unknown
  /** Durably hold each exact batch before its append. Absence preserves pre-ACK retention. */
  readonly staging?: SettlementStaging
}

/** The exact batch one settlement is about to append, with its identity. */
export interface SettlementStagedBatch {
  readonly target: ModelLogSettlementTarget
  readonly current: ModelLogSettlementCurrent | null
  readonly entries: readonly OwnedLogEntry[]
  readonly condition: AppendCondition
}

/** Hold only before an initial append or after proven zero write, never an unknown receipt. */
export interface SettlementStaging {
  readonly hold: (
    batch: SettlementStagedBatch,
  ) => Promise<{ readonly held: true } | { readonly unavailable: true }>
}

export interface SettlementHandle extends SettlementTask<SettlementResult> {}

export interface SettlementCoordinator {
  /**
   * An unknown append keeps its registration and exact batch after the handle stops.
   * A same-target settle recognizes that original through the same-source full prefix.
   * Proven absence releases it and returns write_unknown before another submission.
   */
  readonly settle: (request: SettlementRequest) => SettlementHandle
  /**
   * Revoke admission, stop tasks, and resolve retained unknown originals.
   * Complete only after actual stop and registration release. Failure retains ownership.
   */
  readonly close: () => Promise<void>
}

/** Original call resources. Construction cannot restore an expired binding or owner. */
export interface SettlementCoordinatorBinding {
  readonly binding: SettlementLogBinding
  readonly owner: SettlementOwner
  /** Absence prevents only new withRun settlement, never original-batch recognition. */
  readonly run?: RunHistoryReader
}

/** A trusted root selects the implementation and its explicit policies. */
export interface SettlementCoordinatorFactory {
  readonly create: (binding: SettlementCoordinatorBinding) => SettlementCoordinator
}

export interface SettlementCoordinatorInput extends SettlementCoordinatorBinding {
  /** Entire missing policy/scheduler port makes this progression unavailable. No fallback. */
  readonly settlementContention?: SettlementContention
  readonly settlementScheduler?: SettlementScheduler
  readonly diagnostic: (event: SettlementDiagnostic) => void
}
