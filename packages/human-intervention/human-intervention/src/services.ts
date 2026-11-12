import type { Card, Decision } from './card.ts'
import type {
  AcknowledgeDelivery,
  HitlCommands,
  HitlMethod,
  InvalidateWait,
  RegisterRequest,
  SubmitReply,
} from './commands.ts'
import type { GetCard, GetOperation, GetRequest, ListDeliveries, ListPool } from './queries.ts'
import type {
  ActionBasis,
  CardRef,
  DecisionRef,
  OperationRef,
  Origin,
  RequestRef,
  Revision,
  WaitRef,
} from './values.ts'

export type HitlReadFailure =
  | Readonly<{ kind: 'denied'; reason: string }>
  | Readonly<{ kind: 'invalid-input'; reason: string }>
  | Readonly<{ kind: 'limited'; resource: string; limit: number }>
  | Readonly<{ kind: 'unavailable'; reason: string }>
export type HitlConflict = Readonly<{ kind: 'conflict'; reason: string }>
export type HitlUnknown = Readonly<{ kind: 'unknown'; operationRef: OperationRef }>
export type HitlWriteFailure = HitlReadFailure | HitlConflict
export type CommandSuccesses = {
  registerRequest: Readonly<{
    kind: 'registered'
    requestRef: RequestRef
    revision: Revision
    cards: readonly CardRef[]
  }>
  submitReply:
    | Readonly<{
        kind: 'decided'
        decisionRef: DecisionRef
        revision: Revision
        delivery: 'pending' | 'accepted'
      }>
    | Readonly<{ kind: 'already-decided'; decision: Decision }>
    | Readonly<{ kind: 'invalidated'; reason: string }>
  invalidateWait: Readonly<{ kind: 'invalidated'; affected: number; revision: Revision }>
  acknowledgeDelivery: Readonly<{
    kind: 'acknowledged'
    decisionRef: DecisionRef
    outcome: 'accepted' | 'superseded'
  }>
}
export type CommandResult<Method extends HitlMethod> =
  | ((CommandSuccesses[Method] | HitlWriteFailure) & Readonly<{ operationRef: OperationRef }>)
  | HitlUnknown
export type CommittedOperation = {
  [Method in HitlMethod]: Readonly<{
    kind: 'committed'
    operationRef: OperationRef
    method: Method
    inputDigest: string
    result: Exclude<CommandResult<Method>, HitlUnknown>
    commitReceipt: string
  }>
}[HitlMethod]
export type OperationInspection =
  | CommittedOperation
  | Readonly<{ kind: 'not-committed'; operationRef: OperationRef; sealReceipt: string }>
  | HitlUnknown
  | (HitlConflict & Readonly<{ operationRef: OperationRef }>)
  | HitlReadFailure

export type RequestSnapshot = Readonly<{
  ref: RequestRef
  revision: Revision
  origin: Origin
  displayContext: string
  actionBasis?: ActionBasis
  cards: readonly Card[]
}>
export type PoolItem = Readonly<{ card: Card; origin: Origin; displayContext: string }>
export type PoolPage = Readonly<{
  kind: 'page'
  items: readonly PoolItem[]
  next: string | null
  snapshotRef: string
  completeness: 'complete' | 'partial'
}>
export type Delivery = Readonly<{
  decision: Decision
  wait: WaitRef
  positionRef: string
  adoptionRef: string
}>

export interface HumanInterventionCommands<Access> {
  registerRequest(
    access: Access,
    command: RegisterRequest,
  ): Promise<CommandResult<'registerRequest'>>
  submitReply(access: Access, command: SubmitReply): Promise<CommandResult<'submitReply'>>
  invalidateWait(access: Access, command: InvalidateWait): Promise<CommandResult<'invalidateWait'>>
  acknowledgeDelivery(
    access: Access,
    command: AcknowledgeDelivery,
  ): Promise<CommandResult<'acknowledgeDelivery'>>
}
export interface HumanInterventionQueries<Access> {
  getRequest(
    access: Access,
    query: GetRequest,
  ): Promise<Readonly<{ kind: 'found'; request: RequestSnapshot }> | HitlReadFailure>
  getCard(
    access: Access,
    query: GetCard,
  ): Promise<Readonly<{ kind: 'found'; item: PoolItem }> | HitlReadFailure>
  listPool(access: Access, query: ListPool): Promise<PoolPage | HitlReadFailure | HitlConflict>
  getOperation(access: Access, query: GetOperation): Promise<OperationInspection>
  listDeliveries(
    access: Access,
    query: ListDeliveries,
  ): Promise<
    Readonly<{ kind: 'page'; items: readonly Delivery[]; next: string | null }> | HitlReadFailure
  >
}

export type ProtectedBasis = Readonly<{
  owner: string
  basisRef: string
  operationRef: OperationRef
}>
export type ProtectionVector = Readonly<{
  requiredOwners: readonly string[]
  bases: readonly ProtectedBasis[]
}>
export type JointCommitResult<Method extends HitlMethod> =
  | Readonly<{
      kind: 'committed'
      result: Exclude<CommandResult<Method>, HitlUnknown>
      commitReceipt: string
    }>
  | Readonly<{ kind: 'rejected'; reason: string }>
  | HitlWriteFailure
  | HitlUnknown
export type BoundWait = Readonly<{ ref: WaitRef; preparationRef: string }>
export type DecisionCommitInputs = {
  [Method in Exclude<HitlMethod, 'registerRequest'>]: Readonly<{
    method: Method
    command: HitlCommands[Method]
    protection: ProtectionVector
    wait: BoundWait
  }>
}
export type DecisionCommit = DecisionCommitInputs[keyof DecisionCommitInputs]

export interface DecisionCommitter {
  register(
    input: Readonly<{ command: RegisterRequest; protection: ProtectionVector }>,
  ): Promise<JointCommitResult<'registerRequest'>>
  commit<Method extends keyof DecisionCommitInputs>(
    input: DecisionCommitInputs[Method],
  ): Promise<JointCommitResult<Method>>
  inspect(query: GetOperation): Promise<OperationInspection>
  seal(query: GetOperation): Promise<OperationInspection>
}
