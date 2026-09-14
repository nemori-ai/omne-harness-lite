import type { Diagnostics } from '@omne-harness-lite/diagnostics'
import type {
  CloseResult,
  CommitResult,
  CommittedReceipt,
  Position,
  PreparedCommit,
  PreparedOperation,
  Receipt,
  RecordPreparation,
  RecordWriter,
  UseBinding,
  Watermark,
} from '@omne-harness-lite/records'
import type { OpaqueId, OperationRef } from '@omne-harness-lite/work-data'

export type CompositionKind =
  | 'owner_change'
  | 'input_run'
  | 'action_execution'
  | 'request_wait'
  | 'answer_consequence'
  | 'budget_call'
  | 'content_media'

export type AdmissionFailure = Readonly<{
  status: 'denied' | 'conflict' | 'unavailable'
  owner: string
  code: string
}>

declare const gateFrameBrand: unique symbol
export type GateFrame = Readonly<{ [gateFrameBrand]: true }>

export type OwnerPublication = Readonly<{
  owner: string
  publishLogical: (position: Position, frame: GateFrame) => undefined
  publishDurable: (receipt: Receipt, frame: GateFrame) => undefined
}>

export type ReleaseResult =
  Readonly<{ status: 'released' }> | Readonly<{ status: 'retained'; diagnosticId: OpaqueId }>

declare const exactUseBrand: unique symbol
export type ExactUse = Readonly<{
  [exactUseBrand]: true
  binding: UseBinding
  retainAt: (position: Position, frame: GateFrame) => undefined
  release: (reason: 'not_admitted' | 'verified_not_committed' | 'settled') => Promise<ReleaseResult>
}>

export interface ExactUseIssuer {
  capture(
    binding: Omit<UseBinding, 'owner'>,
    callbacks: Readonly<{
      retainAt: ExactUse['retainAt']
      release: ExactUse['release']
    }>,
  ): ExactUse
}

export type PreparedAdmission = Readonly<{
  composition: CompositionKind
  commit: PreparedCommit
  publications: readonly OwnerPublication[]
  uses: readonly ExactUse[]
}>

export type AdmissionCompletion =
  | Exclude<CommitResult, { status: 'committed' }>
  | Readonly<{
      status: 'committed'
      receipt: CommittedReceipt
      publication: 'ready' | 'blocked'
      diagnosticId?: OpaqueId
    }>

export type PendingAdmission = Readonly<{
  status: 'pending_durability'
  position: Position
  operation: OperationRef
  disposition: 'apply' | 'record_conflict'
  completion: Promise<AdmissionCompletion>
}>

export type AdmissionResult = PendingAdmission | AdmissionCompletion | AdmissionFailure

export type CoordinatorStatus = Readonly<{
  phase: 'open' | 'closing' | 'quarantined' | 'closed'
  logical: Watermark
  durable: Watermark
  diagnosticId?: OpaqueId
}>

export interface AdmissionCoordinator extends RecordPreparation {
  enter<T>(work: (frame: GateFrame) => T): T
  lookupPrepared(
    frame: GateFrame,
    operation: PreparedOperation,
  ): AdmissionResult | Readonly<{ status: 'not_seen' }>
  submit(frame: GateFrame, prepared: PreparedAdmission): AdmissionResult
  status(): CoordinatorStatus
  close(): Promise<CloseResult>
}

export type AdmissionHost = Readonly<{
  coordinator: AdmissionCoordinator
  createUseIssuer: (owner: string) => ExactUseIssuer
}>

export function createAdmissionCoordinator(
  _writer: RecordWriter,
  _diagnostics: Diagnostics,
): AdmissionHost {
  throw new Error('admission coordinator implementation is not available yet')
}
