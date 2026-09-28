import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type { TenantId } from '@omne-harness-lite/identity-values'
import type { SessionRef } from '@omne-harness-lite/messages'
import type { AppendResult, SessionLog } from '@omne-harness-lite/session-log-jsonl'
import type {
  ModelLogSettlementTarget,
  ModelLogSettlementCurrent,
  SettlementMembersResult,
} from './log-codec.ts'

/** Actual access and lifetime are established by the host, not certified by this shape. */
export interface SettlementLogBinding {
  readonly session: SessionRef
  readonly tenant: TenantId
  readonly log: SessionLog
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
export type SettlementTaskKind = 'read' | 'append' | 'wait'
export interface SettlementRegistration {
  /** Register synchronously before invoking operation; retain it until actual stopped. */
  readonly start: <T>(
    kind: SettlementTaskKind,
    operation: (signal: AbortSignal) => Promise<T>,
  ) => SettlementTask<T>
  /** Called only once, after all this registration's tasks actually stopped. */
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
export type SettlementResult =
  | { readonly settled: SettlementComplete; readonly origin: 'appended' | 'recognized' }
  | { readonly unavailable: true; readonly reason: SettlementUnavailableReason }
export interface SettlementHandle extends SettlementTask<SettlementResult> {}
export interface SettlementCoordinator {
  readonly settle: (request: SettlementRequest) => SettlementHandle
  /** Close admission/request stop. Promise completes only when actual owned tasks stop. */
  readonly close: () => Promise<void>
}
