import type { Outcome } from '@omne-harness/operation-result'
import type {
  Access,
  ActorRef,
  Adoption,
  ConsumerRef,
  DurableEvidence,
  ExecutionRef,
  FixedModelRequest,
  Handoff,
  LateDispatchFact,
  MaterializationReceipt,
  ModelCallId,
  ModelClock,
  ModelConsumerOwnerDeclaration,
  ModelFailure,
  ModelOperationId,
  ResultCapacity,
  ResultVersion,
  RetryDecision,
  RetryPosition,
  Supplier,
  TransportFact,
} from '@omne-harness/model-contract'

export type MemoryAction =
  | 'admit'
  | 'facts'
  | 'content'
  | 'control'
  | 'handoff'
  | 'account'
  | 'recovery'
  | 'observe'
  | 'send'
export type MemoryResource =
  | Readonly<{ kind: 'tenant' }>
  | Readonly<{ kind: 'call'; call: ModelCallId; consumer: ConsumerRef | null }>
export interface MemoryModelAuthority<P> {
  authorize(
    input: Readonly<{ action: MemoryAction; access: Access<P>; resource: MemoryResource }>,
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
export interface MemoryModelEvidence {
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
export type MemoryModelLimits = Readonly<{
  scanPageCalls: number
  resultPageParts: number
  resultPageTargetBytes: number
  readIdleMs: number
  capacity: ResultCapacity
}>
export type MemoryModelCommandsOptions<P> = Readonly<{
  owners: readonly ModelConsumerOwnerDeclaration[]
  authority: MemoryModelAuthority<P>
  evidence: readonly MemoryModelEvidence[]
  clock: Pick<ModelClock, 'now'>
  limits: MemoryModelLimits
}>
export const MEMORY_WRITE_METHODS = [
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
export type MemoryWriteMethod = (typeof MEMORY_WRITE_METHODS)[number]
export type UnknownInjection = Pick<ExecutionRef, 'tenant' | 'call'> &
  Readonly<{
    operation: ModelOperationId
    method: MemoryWriteMethod
    effect: 'applied' | 'not-applied'
  }>
export interface MemoryModelControl {
  injectUnknown(input: UnknownInjection): void
  reveal(
    input: Pick<UnknownInjection, 'tenant' | 'call' | 'operation'> &
      Readonly<{ result: 'committed' | 'rolled-back' | 'not-committed' }>,
  ): void
  replaceOwners(owners: readonly ModelConsumerOwnerDeclaration[]): void
  setCleanupFailure(
    input: Pick<ExecutionRef, 'tenant' | 'call'> & Readonly<{ diagnostic: string | null }>,
  ): void
}

/** Explicit trusted assembly registration. current runs inside MemoryState's synchronous fence. */
export type MemorySendSource<P> = Readonly<{
  profile: Adoption
  supplier: Adoption
  recipient: string
  model: string
  credential:
    | Readonly<{ kind: 'tenant' }>
    | Readonly<{
        kind: 'factory'
        official: true
        queryId: import('@omne-harness/model-contract').CredentialId
      }>
  current(input: import('@omne-harness/model-contract').SendDemand<P>): Outcome<
    Readonly<{
      authorized: boolean
      noTenantBinding: boolean
    }>,
    ModelFailure
  >
}>
