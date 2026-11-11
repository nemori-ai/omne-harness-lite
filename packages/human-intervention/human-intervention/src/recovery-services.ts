import type {
  BindReceiver,
  ConsumeDecision,
  GetRecoveryOperation,
  GetWait,
  ReadInbox,
  RecoveryMethod,
} from './recovery.ts'
import type {
  Delivery,
  HitlConflict,
  HitlReadFailure,
  HitlUnknown,
  HitlWriteFailure,
} from './services.ts'
import type { ConsumerReceipt, OperationRef, ReceiverGeneration, WaitRef } from './values.ts'

export type WaitSnapshot = Readonly<{
  waitRef: WaitRef
  adoptionRef: string
  receiverGeneration: ReceiverGeneration
  deliveryCursor: string | null
}> &
  (
    | Readonly<{ state: 'waiting' | 'replied' }>
    | Readonly<{ state: 'accepted'; receipts: readonly ConsumerReceipt[] }>
    | Readonly<{ state: 'terminal'; terminalEvidenceRef: string }>
  )
export type RecoveryStaleGeneration = Readonly<{ kind: 'stale-generation' }>
export type RecoveryTerminal = Readonly<{ kind: 'terminal'; terminalEvidenceRef: string }>
export type RecoveryIncompatible = Readonly<{ kind: 'incompatible'; reason: string }>
export type RecoveryOutcomes = {
  bindReceiver:
    | Readonly<{ kind: 'bound'; waitRef: WaitRef; receiverGeneration: ReceiverGeneration }>
    | RecoveryTerminal
    | RecoveryIncompatible
  consumeDecision:
    | Readonly<{ kind: 'accepted'; receipt: ConsumerReceipt & Readonly<{ outcome: 'accepted' }> }>
    | Readonly<{
        kind: 'superseded'
        receipt: ConsumerReceipt & Readonly<{ outcome: 'superseded' }>
      }>
    | RecoveryStaleGeneration
    | RecoveryIncompatible
}
export type RecoveryCommandResult<Method extends RecoveryMethod> =
  | ((RecoveryOutcomes[Method] | HitlWriteFailure) & Readonly<{ operationRef: OperationRef }>)
  | HitlUnknown
export type CommittedRecoveryOperation = {
  [Method in RecoveryMethod]: Readonly<{
    kind: 'committed'
    method: Method
    operationRef: OperationRef
    inputDigest: string
    result: Exclude<RecoveryCommandResult<Method>, HitlUnknown>
    commitReceipt: string
  }>
}[RecoveryMethod]
export type RecoveryOperationInspection =
  | CommittedRecoveryOperation
  | Readonly<{ kind: 'not-committed'; operationRef: OperationRef; sealReceipt: string }>
  | HitlUnknown
  | (HitlConflict & Readonly<{ operationRef: OperationRef }>)
  | HitlReadFailure

export interface RecoveryCommands<Access> {
  bindReceiver(
    access: Access,
    command: BindReceiver,
  ): Promise<RecoveryCommandResult<'bindReceiver'>>
  consumeDecision(
    access: Access,
    command: ConsumeDecision,
  ): Promise<RecoveryCommandResult<'consumeDecision'>>
}
export interface RecoveryQueries<Access> {
  getWait(
    access: Access,
    query: GetWait,
  ): Promise<
    | Readonly<{ kind: 'found'; wait: WaitSnapshot }>
    | Readonly<{ kind: 'not-found' }>
    | HitlReadFailure
  >
  readInbox(
    access: Access,
    query: ReadInbox,
  ): Promise<
    | Readonly<{ kind: 'page'; decisions: readonly Delivery[]; next: string | null }>
    | HitlReadFailure
    | RecoveryStaleGeneration
    | HitlConflict
  >
  getRecoveryOperation(
    access: Access,
    query: GetRecoveryOperation,
  ): Promise<RecoveryOperationInspection>
}
