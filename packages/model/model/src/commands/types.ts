import type { Outcome } from '@omne-harness/operation-result'
import type { StreamAssembly } from '@omne-harness/stream-arrival'
import type {
  Access,
  Admission,
  Adoption,
  CallState,
  ConsumerRef,
  CredentialId,
  DispatchRecord,
  DurableEvidence,
  FixedModelRequest,
  Handoff,
  MaterializationReceipt,
  ModelCallId,
  ModelFailure,
  ModelOperationId,
  OutputCursor,
  ReadId,
  ReadState,
  ResultCapacity,
  ResultTrim,
  ResultVersion,
  RetryDecision,
  RetryPosition,
  Revision,
  Settlement,
  Snapshot,
  Supplier,
  Termination,
  VisibleBlock,
} from '@omne-harness/model-contract'
import type {
  ActorRef,
  ExecutionRef,
  LateDispatchFact,
  ModelClock,
  ModelConsumerOwnerDeclaration,
  ProviderDiagnostic,
  SendDemand,
  TransportFact,
} from '@omne-harness/model-contract/provider'

/** The access purposes for which the commands ask the current authority. */
export type CommandAction =
  | 'admit'
  | 'facts'
  | 'content'
  | 'control'
  | 'handoff'
  | 'account'
  | 'recovery'
  | 'observe'
  | 'send'
export type CommandResource =
  | Readonly<{ kind: 'tenant' }>
  | Readonly<{ kind: 'call'; call: ModelCallId; consumer: ConsumerRef | null }>
export interface ModelCommandsAuthority<P> {
  authorize(
    input: Readonly<{ action: CommandAction; access: Access<P>; resource: CommandResource }>,
  ): Outcome<ActorRef, ModelFailure>
  execution(input: ExecutionRef): Outcome<ActorRef, ModelFailure>
}
export type EvidenceContext = Readonly<{
  execution: ExecutionRef | null
  call: ModelCallId
  consumer: ConsumerRef
  request: FixedModelRequest
}> &
  Pick<ExecutionRef, 'tenant'>
export interface ModelCommandsEvidence {
  readonly adoption: Adoption
  continuity(
    input: EvidenceContext & Readonly<{ successor: string; source: DurableEvidence }>,
  ): Outcome<DurableEvidence, ModelFailure>
  materialization(
    input: EvidenceContext &
      Readonly<{ dispatch: string; supplier: Supplier; receipt: MaterializationReceipt }>,
  ): Outcome<DurableEvidence, ModelFailure>
  lateFact(
    input: Omit<EvidenceContext, 'request'> &
      Readonly<{
        dispatch: string
        supplier: Supplier
        source: DurableEvidence
        fact: LateDispatchFact
      }>,
  ): Outcome<DurableEvidence, ModelFailure>
  retry(
    input: EvidenceContext &
      Readonly<{ position: RetryPosition; decision: RetryDecision; source: DurableEvidence }>,
  ): Outcome<DurableEvidence, ModelFailure>
  handoff(
    input: Omit<EvidenceContext, 'request'> &
      Readonly<{ result: ResultVersion; evidence: Handoff }>,
  ): Outcome<DurableEvidence, ModelFailure>
  receive(
    input: EvidenceContext &
      Readonly<{
        dispatch: string
        window: string
        facts: readonly TransportFact[]
        batchDigest: string
      }>,
  ): Outcome<
    Readonly<{ window: string; batchDigest: string; paused: true; noPrefetch: true }>,
    ModelFailure
  >
}
/**
 * `capacity` bounds the sum that the storage reports from `reserved`. The storage decides the
 * scope of that sum: the memory storage sums the whole assembly.
 */
export type ModelCommandsLimits = Readonly<{
  scanPageCalls: number
  resultPageParts: number
  resultPageTargetBytes: number
  readIdleMs: number
  capacity: ResultCapacity
}>
export type ResultPaging = Pick<ModelCommandsLimits, 'resultPageParts' | 'resultPageTargetBytes'>
export type ModelCommandsCoreOptions<P> = Readonly<{
  owners: readonly ModelConsumerOwnerDeclaration[]
  authority: ModelCommandsAuthority<P>
  evidence: readonly ModelCommandsEvidence[]
  clock: Pick<ModelClock, 'now'>
  limits: ModelCommandsLimits
}>
export const MODEL_WRITE_METHODS = [
  'admit',
  'claim',
  'prepareDispatch',
  'recordMaterialization',
  'recordSend',
  'openReceiveWindow',
  'preserve',
  'recordLateFact',
  'prepareRetry',
  'decideRetry',
  'settle',
  'control',
  'acquireRead',
  'handoff',
  'advanceCleanup',
] as const
export type ModelWriteMethod = (typeof MODEL_WRITE_METHODS)[number]

/** A trusted send source registration. `current` runs inside the storage's synchronous fence. */
export type ModelSendSource<P> = Readonly<{
  profile: Adoption
  supplier: Adoption
  recipient: string
  model: string
  credential:
    | Readonly<{ kind: 'tenant' }>
    | Readonly<{ kind: 'factory'; official: true; queryId: CredentialId }>
  current(input: SendDemand<P>): Outcome<
    Readonly<{
      authorized: boolean
      noTenantBinding: boolean
    }>,
    ModelFailure
  >
}>

/** What a committed write keeps, so that a repeat of the same operation recovers its value. */
export type Receipt =
  | Readonly<{ kind: 'revision'; revision: Revision }>
  | Readonly<{ kind: 'admit'; admission: Admission }>
  | Readonly<{ kind: 'claim'; instance: string; generation: string }>
  | Readonly<{ kind: 'materialization'; revision: Revision; source: DurableEvidence }>
  | Readonly<{ kind: 'retry'; position: RetryPosition }>
  | Readonly<{ kind: 'settle'; settlement: Settlement }>
  | Readonly<{ kind: 'preserve'; cursor: OutputCursor }>
  | Readonly<{ kind: 'late'; revision: Revision }>
  | Readonly<{ kind: 'read'; read: ReadId | null }>
  | Readonly<{ kind: 'control' | 'handoff' | 'cleanup' }>
/** The binding of one operation, before the storage gives it a commit status. */
export type BindingBase = Readonly<{
  call: ModelCallId
  method: ModelWriteMethod
  fingerprint: string
  revision: Revision
  receipt: Receipt
}>
export type Binding = BindingBase &
  (
    | Readonly<{ status: 'committed' }>
    | Readonly<{ status: 'unknown'; effect: 'applied' | 'not-applied' }>
    | Readonly<{ status: 'rolled-back' | 'not-committed' }>
  )
export type ReadRelation = {
  id: ReadId
  lastProgress: string
  furthest: number
  state: Extract<ReadState, { kind: 'ended' }> | { kind: 'reading'; offset: number }
}
export type DispatchDocument = {
  record: DispatchRecord
  logicalTerminal: Termination | null
  windows: Map<string, 'open' | 'closed' | 'unproven'>
  events: Map<string, string>
  assembly: StreamAssembly | null
  blocks: readonly VisibleBlock[]
  nextSeq: Map<string, string>
  trims: Map<string, readonly ResultTrim[]>
  hadContent: Set<string>
  /** The provider diagnostics of this dispatch, in the order they arrived. */
  diagnostics: readonly ProviderDiagnostic[]
}
/** One call, as the commands read and write it. */
export type CallDocument = {
  state: CallState
  request: FixedModelRequest | null
  requestDigest: string
  capacity: ResultCapacity
  initiator: ActorRef
  admission: ModelOperationId
  owner: ModelConsumerOwnerDeclaration
  execution: ExecutionRef | null
  dispatches: DispatchDocument[]
  retry: RetryDecision | null
  retryPosition: RetryPosition | null
  retrySource: DurableEvidence | null
  cursor: OutputCursor
  snapshots: Map<OutputCursor, Snapshot>
  reads: Map<ReadId, ReadRelation>
  cleanupFailure: string | null
  resultPaging: ResultPaging
}
/** The documents of one tenant that one command attempt reads. */
export type TenantDocuments = Readonly<{
  calls: ReadonlyMap<ModelCallId, CallDocument>
  operations: ReadonlyMap<ModelOperationId, Binding>
}>
export type WriteIdentity = Pick<ExecutionRef, 'tenant' | 'call'> & {
  readonly operation: ModelOperationId
}
export type Draft = { tenant: TenantDocuments; call: CallDocument | undefined }
export type Applied<T> = { value: T; receipt: Receipt }
