import type { CallKey } from '@omne-harness-lite/messages'
import type { ResponseId } from '@omne-harness-lite/model-response'
import type { AckPendingReason, ModelCallCleanupResult } from './reference-types.ts'
import type { ServiceUnavailable } from './service-types.ts'
import type { RuntimeRecoveryScope } from './service-types.ts'
import type { SettlementPrefix } from './settlement-prefix.ts'
import type {
  RunHistoryReader,
  SettlementComplete,
  SettlementContention,
  SettlementDiagnostic,
  SettlementLogBinding,
  SettlementOwner,
  SettlementScheduler,
  SettlementRequest,
  SettlementStagedBatch,
  SettlementCoordinatorInput,
  SettlementCoordinator,
} from './settlement-types.ts'

type ModelCallRetentionKey = {
  readonly binding: SettlementLogBinding
  readonly call: CallKey['callId']
}
/** RT12 S-99⑧: one post-ACK settlement's write responsibility for one ResponseId. */
export type ModelCallSettlementWorkKey = ModelCallRetentionKey & {
  readonly response: ResponseId
}

/**
 * The durable staging row of one started post-ACK settlement: the complete batch of the latest
 * append not yet known to have written nothing, with its identity. `workId` names one write
 * responsibility; `generation` counts its durable replacements. Every change is conditioned on
 * both, so a late worker of another work or an older generation is refused.
 */
export interface ModelCallSettlementWork {
  readonly workId: string
  readonly generation: number
  /** The runtime instance that started the work; another instance needs recovery evidence. */
  readonly owner: string
  readonly staged: SettlementStagedBatch
}

export interface ModelCallSettlementWorkStore {
  /** Insert a new work row; an existing row of any work is returned, never replaced. */
  readonly stage: (
    input: ModelCallSettlementWorkKey & {
      readonly workId: string
      readonly owner: string
      readonly staged: SettlementStagedBatch
    },
  ) => Promise<
    | { readonly staged: { readonly generation: number } }
    | { readonly occupied: ModelCallSettlementWork }
    | ServiceUnavailable
  >
  /** Replace the held batch of this exact work and generation after a proven zero write. */
  readonly replace: (
    input: ModelCallSettlementWorkKey & {
      readonly workId: string
      readonly generation: number
      readonly staged: SettlementStagedBatch
    },
  ) => Promise<
    | { readonly staged: { readonly generation: number } }
    | { readonly rejected: true }
    | ServiceUnavailable
  >
  readonly read: (
    key: ModelCallSettlementWorkKey,
  ) => Promise<
    { readonly work: ModelCallSettlementWork } | { readonly absent: true } | ServiceUnavailable
  >
  /**
   * Delete this exact work and generation. `rejected` means the row now belongs to another
   * work or generation and was left untouched. An unknown commit is recognized only by reading
   * the row as absent; the row still present or an unreadable row stays pending.
   */
  readonly remove: (
    key: ModelCallSettlementWorkKey & { readonly workId: string; readonly generation: number },
  ) => Promise<
    | { readonly removed: true }
    | { readonly rejected: true }
    | { readonly pending: 'storage_unavailable' | 'receipt_unknown' }
  >
}

/**
 * What one post-ACK write responsibility concluded. `ended`: every writer of this work actually
 * stopped and a complete authoritative prefix proved its batch absent, so the responsibility
 * ended and its row was retired. `retained`: an unknown receipt, an unproven stop, a residual
 * batch or an unreadable source keeps the row and, where one exists, the original writer.
 */
export type SettlementWorkOutcome =
  | { readonly settled: SettlementComplete; readonly origin: 'appended' | 'recognized' }
  | { readonly ended: true }
  | { readonly retained: true }

export interface SettlementWork {
  readonly workId: string
  readonly ref: CallKey
  readonly request: SettlementRequest
  /** Settle (or resolve the retained original), then conclude from actual stop and the log. */
  readonly advance: () => Promise<SettlementWorkOutcome>
  /** Stop admission for this work; true only when no writer of it remains owned. */
  readonly close: () => Promise<boolean>
}

export type ModelSettlementWorkRetirement = (input: {
  readonly binding: SettlementLogBinding
  readonly ref: CallKey
  readonly response: ResponseId
  readonly workId: string
  readonly generation: number
  readonly obstacles?: () => readonly AckPendingReason[]
}) => Promise<ModelCallCleanupResult>

export interface SettlementWorkInput {
  readonly binding: SettlementLogBinding
  readonly owner: SettlementOwner
  readonly store: ModelCallSettlementWorkStore
  readonly custody: { readonly retireWork: ModelSettlementWorkRetirement }
  /** The runtime instance that owns this work; recorded on the row for recovery. */
  readonly instance: string
  readonly ref: CallKey
  /** Target, current and the complete final; this function adds the staging. */
  readonly request: Omit<SettlementRequest, 'staging'>
  readonly contention: SettlementContention
  readonly scheduler: SettlementScheduler
  readonly run?: RunHistoryReader
  readonly diagnostic: (event: SettlementDiagnostic) => void
  /** Other writers of the same call that must actually stop before the row is deleted. */
  readonly obstacles?: () => readonly AckPendingReason[]
}

/** A runtime's view of the post-ACK work rows it may conclude as the recovery owner. */
export interface SettlementWorkRecovery {
  readonly store: ModelCallSettlementWorkStore
  /** A live component of this runtime still owns the work; recovery leaves it alone. */
  readonly owns: (ref: CallKey) => boolean
}

export interface SettlementWorkRecoveryInput {
  readonly key: CallKey
  readonly response: ResponseId
  readonly prefix: SettlementPrefix
  readonly scope: RuntimeRecoveryScope
  readonly binding: SettlementLogBinding
  readonly work: SettlementWorkRecovery
  readonly custody: { readonly retireWork: ModelSettlementWorkRetirement }
  readonly diagnostic: (event: SettlementDiagnostic) => void
}

/** Session owns log interpretation. The root supplies these implementations without fallback. */
export interface SessionModelSettlement {
  readonly create: (input: SettlementCoordinatorInput) => SettlementCoordinator
  readonly createWork: (input: SettlementWorkInput) => SettlementWork
  readonly recoverWork: (input: SettlementWorkRecoveryInput) => Promise<void>
}
