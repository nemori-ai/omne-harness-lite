import type { TenantId } from '@omne-harness/legal-identity'
import type {
  CompactionBase,
  CompactionMessage,
  Message,
  MessageId,
  RecordEntryRef,
} from '@omne-harness/message'
import type * as M from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import type { Reply } from './evaluation.ts'
import type {
  Access,
  ActionId,
  AgentExecutionId,
  Adoption,
  CompactionOperationId,
  CompactionTaskId,
  ConsumerRef,
  ConsumptionId,
  DurableEvidence,
} from './identity.ts'

export type CompactionTaskRef = Readonly<{
  authority: string
  tenant: TenantId
  task: CompactionTaskId
  requestDigest: string
}>

/** Generation evidence binds the provider authority and original request, never the output digest. */
export function compactionGeneration(ref: CompactionTaskIdentity): DurableEvidence {
  return { owner: ref.authority, record: ref.task, revision: '1', digest: ref.requestDigest }
}

export type CompactionTaskIdentity = Omit<CompactionTaskRef, 'tenant'>
export type CompactionProviderBinding = Readonly<{ authority: string; adoption: Adoption }>

export type VisibleHistoryEntry = Readonly<{
  ref: RecordEntryRef
  sequence: string
  message: Message
  sourceCall?: M.ModelCallId
  represented: readonly M.AssembledModelInput['messages'][number][]
}>

export type CompactionHistory = Readonly<{
  source: DurableEvidence
  origin: RecordEntryRef
  upper: RecordEntryRef
  epoch: string
  base: CompactionBase
  entries: readonly VisibleHistoryEntry[]
  logOrder: readonly RecordEntryRef[]
  barriers: readonly RecordEntryRef[]
  protected: readonly RecordEntryRef[]
}>

export type CompactionTarget = Readonly<{
  profile: Extract<M.ProfileResolution, { kind: 'resolved' }> & Readonly<{ selectable: true }>
  parameters: readonly M.Parameter[]
  representation: Adoption
  measurement: Adoption
  goals: readonly Readonly<{
    metric: M.LimitMetric | 'context-tokens' | 'input-tokens'
    relation: 'less-than' | 'at-most'
    limit: string
  }>[]
}>

export type CompactionFrame = Readonly<{
  system: M.AssembledModelInput['system']
  tools: M.AssembledModelInput['tools']
  snapshotReminder: Message | null
  tailFacts: Message | null
}>

export type CompactionInput = Readonly<{
  outputMessageId: MessageId
  history: CompactionHistory
  frame: CompactionFrame
  target: CompactionTarget
}>

export type CompactionInputRef = Readonly<{
  source: DurableEvidence
  schema: Adoption
  digest: string
}>

export interface CompactionInputReader<P> {
  read(input: Access<P> & Readonly<{ reference: CompactionInputRef }>): Reply<CompactionInput>
}

export interface CompactionInputStore<P> extends CompactionInputReader<P> {
  freeze(
    input: Access<P> &
      Readonly<{
        execution: AgentExecutionId
        preparation: ActionId
        value: Omit<CompactionInput, 'outputMessageId'>
      }>,
  ): Reply<CompactionInputRef>
}

export type CompactionRequest = Readonly<{
  ref: CompactionTaskRef
  provider: Adoption
  consumer: ConsumerRef
  preparation: ActionId
  input: CompactionInput
}>

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.entries(value)
    .filter(([, member]) => member !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, member]) => `${JSON.stringify(key)}:${canonical(member)}`)
    .join(',')}}`
}

export function compactionRequestText(
  request: Omit<CompactionRequest, 'ref'> &
    Readonly<{ ref: Omit<CompactionTaskRef, 'requestDigest'> }>,
): string {
  const { authority, tenant, task } = request.ref
  return canonical({
    ref: { authority, tenant, task },
    provider: request.provider,
    consumer: request.consumer,
    preparation: request.preparation,
    input: request.input,
  })
}

export function compactionInputText(input: CompactionInput): string {
  return canonical(input)
}

export type CompactionOutcome =
  | Readonly<{ kind: 'completed'; message: CompactionMessage }>
  | Readonly<{
      kind: 'cannot-fit'
      reason: 'protected-floor' | 'after-compaction'
      diagnostic: string
    }>
  | Readonly<{
      kind: 'failed'
      reason: 'execution-failed' | 'execution-limit' | 'invalid-output' | 'source-lost'
      diagnostic: string
    }>
  | Readonly<{ kind: 'cancelled'; operation: CompactionOperationId }>

export type CompactionResultIdentity = Readonly<{
  version: string
  evidence: DurableEvidence
  digest: string
}>

export type CompactionPhysicalSettlement = 'pending' | 'settled' | 'unknown'

export type CompactionTaskState = Readonly<{
  ref: CompactionTaskRef
  revision: string
  physical: CompactionPhysicalSettlement
}> &
  (
    | Readonly<{ phase: 'pending'; knowledge: 'accepted' | 'uncertain' }>
    | Readonly<{
        phase: 'terminal'
        result: CompactionResultIdentity
        outcome: CompactionOutcome
        custody: 'provider'
      }>
    | Readonly<{
        phase: 'handed-off'
        result: CompactionResultIdentity
        receipt: DurableEvidence
      }>
  )

export type CompactionFailure =
  | Readonly<{ kind: 'denied'; action: string }>
  | Readonly<{ kind: 'invalid'; field: string; reason: string }>
  | Readonly<{ kind: 'unsupported'; field: string; provider: Adoption }>
  | Readonly<{ kind: 'capacity'; diagnostic: string }>
  | Readonly<{ kind: 'unavailable'; dependency: string; diagnostic: string }>
  | Readonly<{ kind: 'unknown'; ref: CompactionTaskRef }>
  | Readonly<{ kind: 'commit-unknown'; ref: CompactionTaskRef; operation: string }>
  | Readonly<{ kind: 'conflict'; ref: CompactionTaskRef }>
  | Readonly<{ kind: 'not-terminal' }>
  | Readonly<{ kind: 'not-found' }>
  | Readonly<{ kind: 'handoff-invalid'; reason: string }>

export type CompactionReply<T> = Promise<Outcome<T, CompactionFailure>>

export type CompactionHandoff = Readonly<{ consumer: ConsumerRef }> &
  (
    | Readonly<{ kind: 'retained'; custody: DurableEvidence }>
    | Readonly<{
        kind: 'processed'
        disposition: 'adopted' | 'excluded' | 'failed'
        completion: DurableEvidence
      }>
  )

export interface ContextCompaction<P> {
  admit(
    input: Access<P> & Readonly<{ request: CompactionRequest }>,
  ): CompactionReply<CompactionTaskState>
  inspect(
    input: Access<P> & Readonly<{ ref: CompactionTaskRef }>,
  ): CompactionReply<
    Readonly<{ kind: 'found'; state: CompactionTaskState }> | Readonly<{ kind: 'missing' }>
  >
  cancel(
    input: Access<P> & Readonly<{ ref: CompactionTaskRef; operation: CompactionOperationId }>,
  ): CompactionReply<CompactionTaskState>
  acknowledge(
    input: Access<P> &
      Readonly<{
        ref: CompactionTaskRef
        operation: CompactionOperationId
        result: CompactionResultIdentity
        handoff: CompactionHandoff
      }>,
  ): CompactionReply<
    Readonly<{
      ref: CompactionTaskRef
      result: CompactionResultIdentity
      receipt: DurableEvidence
    }>
  >
}

export type PreparedCompactionCommit = Readonly<{
  preparation: ActionId
  task: CompactionTaskIdentity
  consumption: ConsumptionId
  result: CompactionResultIdentity
  received: DurableEvidence
  message: CompactionMessage
  /** The holder's frozen input source, identical to the current task's input.source. */
  history: DurableEvidence
  epoch: string
  admission: DurableEvidence
}>
