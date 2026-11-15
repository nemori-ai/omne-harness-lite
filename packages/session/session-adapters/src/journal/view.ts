import type {
  ActionBatchId,
  ActionId,
  AgentInstanceId,
  Adoption,
  AgentConclusion,
  AgentExecutionId,
  AgentOperationId,
  Authority,
  ConsumerRef,
  ConsumptionId,
  ControlStage,
  DurableEvidence,
  ExecutionControl,
  HandoffReference,
  InputBatch,
  InputId,
  ModelReplyAdmission,
  PassageId,
  PendingCall,
  StepId,
  Waiting,
} from '@omne-harness/agent-contract'
import type { ModelInvocationRef } from '@omne-harness/model-contract'
import type { ToolInvocationRef, ToolOperationRef } from '@omne-harness/tool-contract'
import { canonical } from '../testing/canonical.ts'
import {
  type ExclusionReason,
  digestOf,
  type AttachmentBasis,
  type Attempt,
  type CursorMembers,
  type FactBody,
  type FactOf,
  type ParticipationKind,
  type ProducerCall,
  type Ref,
  type ResultStage,
} from './facts.ts'

export type AttachmentView = Readonly<{
  authority: Authority
  grant: DurableEvidence | null
  basis: AttachmentBasis
  status: 'active' | 'detached' | 'superseded'
  handoff: DurableEvidence | null
  handoffRevision: number
  pub: number
}>

export type InputView = Readonly<{
  input: InputId
  entry: AgentOperationId
  message: Ref
  source: DurableEvidence | null
  priority: 'ordinary' | 'urgent'
  watermark: DurableEvidence
  pub: number
  revision: number
}>

export type RequestView = Readonly<{
  step: StepId
  attempt: Attempt
  reference: ModelInvocationRef
  fixed: DurableEvidence
  schema: Adoption
  record: Ref
  coverage: DurableEvidence | null
  voided: Readonly<{ cause: 'not-accepted' | 'lost'; basis: DurableEvidence }> | null
  pub: number
}>

export type IntentView = Readonly<{
  action: ActionId
  step: StepId
  pending: PendingCall
  authority: Authority
  request: Ref | null
  association: Readonly<{ reference: ToolInvocationRef; receipt: DurableEvidence }> | null
  judgment: Readonly<{
    judgment: 'pending' | 'waiting' | 'denied' | 'allowed'
    evidence: DurableEvidence | null
    passage: PassageId | null
    request: Ref | null
  }> | null
  settlement: DurableEvidence | null
  pub: number
}>

export type ResultView = Readonly<{
  consumption: ConsumptionId
  result: ProducerCall
  received: Readonly<{
    delivery: string
    consumer: ConsumerRef
    custody: Ref
    saved: DurableEvidence
    material: Ref | null
    pub: number
  }> | null
  stages: Readonly<Partial<Record<ResultStage, DurableEvidence>>>
  pub: number
}>

export type AdmissionView = Readonly<{
  sequence: number
  fact: ModelReplyAdmission
  basis: DurableEvidence
  publication: DurableEvidence
  message: Ref | null
  source: DurableEvidence | null
  history: DurableEvidence | null
  pub: number
  revision: number
}>

export type HandoffView = Readonly<{
  handoff: HandoffReference
  prepared: Readonly<{ request: Ref; prepared: DurableEvidence; pub: number }> | null
  resolved: Readonly<{
    resolution: 'recorded' | 'excluded'
    outcome: Ref
    history: DurableEvidence | null
    pub: number
    revision: number
  }> | null
  retired: Readonly<{
    reason: DurableEvidence
    excluded: Ref
    pub: number
    revision: number
  }> | null
  recorded: readonly Readonly<{
    resolution: 'recorded' | 'excluded'
    outcome: Ref
    predecessor: AgentOperationId | null
    custody: Ref | null
    op: AgentOperationId
    pub: number
  }>[]
}>

export type BatchView = Readonly<{
  batch: ActionBatchId
  step: StepId
  source: ProducerCall
  actions: readonly Readonly<{ action: ActionId; callId: string; arguments: Ref }>[]
  pub: number
}>

export type PassageView = Readonly<{
  passage: PassageId
  subject: Ref
  declared: DurableEvidence
  progress: readonly Readonly<{ progress: Ref; round: string | null; pub: number }>[]
  conclusion: Readonly<{ conclusion: Ref; evidence: DurableEvidence; pub: number }> | null
  pub: number
}>

export type ControlView = Readonly<{
  control: AgentOperationId
  command: ExecutionControl
  toolInvocation: ToolInvocationRef | null
  toolOperation: ToolOperationRef | null
  stages: Readonly<
    Partial<
      Record<ControlStage, Readonly<{ state: 'reached' | 'unresolved'; source: DurableEvidence }>>
    >
  >
  rejected: readonly DurableEvidence[]
  pub: number
}>

export type CandidateView = Readonly<{
  candidate: AgentOperationId
  claim: FactOf<'finish.candidate'>['claim']
  cursor: Ref
  route: DurableEvidence
  path: Ref
  supersedes: AgentOperationId | null
  beforeTerminal: DurableEvidence | null
  pub: number
  revision: number
}>

export type ObligationListView = Readonly<{
  candidate: AgentOperationId
  list: number
  issued: Readonly<{
    count: number
    evidence: DurableEvidence
    coverage: Ref
    listed: Ref
    op: AgentOperationId
    pub: number
    revision: number
  }>
}>

export type ObligationView = Readonly<{ category: string; item: Ref | null; pub: number }>

export const listKey = (candidate: AgentOperationId, list: number): string => `${candidate}/${list}`

export type FinishView = Readonly<{
  candidates: readonly CandidateView[]
  lists: ReadonlyMap<string, ObligationListView>
  obligations: ReadonlyMap<string, ObligationView>
  current: AgentOperationId | null
  ended: Readonly<{
    candidate: AgentOperationId | null
    conclusion: AgentConclusion
    disposition: DurableEvidence
    pub: number
    revision: number
  }> | null
}>

export type EventView = Readonly<{
  eseq: number
  kind: string
  pub: number
  ord: number
  revision: number
  attachment: Authority | null
  fact: FactBody
}>

export type BindingView = Readonly<{
  definition: Adoption
  reference: string
  pending: Ref<PendingCall>
  instance: AgentInstanceId
  pub: number
}>

export type ExclusionEntry = Readonly<{
  execution: AgentExecutionId
  reason: ExclusionReason
  evidence: DurableEvidence
  predecessor: AgentOperationId | null
  pub: number
}>

export type OperationEntry = Readonly<{
  execution: AgentExecutionId
  digest: string
  pub: number
  revision: number
  target: AgentOperationId | null
  recalls: boolean
  kinds: readonly ParticipationKind[]
}>

export type RejectionEntry = Readonly<{
  control: AgentOperationId
  audit: DurableEvidence
  pub: number
  revision: number
}>

export type ExecutionView = Readonly<{
  execution: AgentExecutionId
  revision: number
  head: number
  gen: string
  opened: Readonly<{
    definition: Adoption
    schema: Adoption
    instance: string
    scope: DurableEvidence
    original: Readonly<{ input: InputId; entry: AgentOperationId; handoff: HandoffReference }>
    coordination: 'standalone' | 'coordinated'
    pub: number
  }> | null
  attachments: readonly AttachmentView[]
  cursor: Readonly<Partial<CursorMembers>>
  cursorMoved: Readonly<Partial<Record<keyof CursorMembers, number>>>
  inputs: readonly InputView[]
  steps: readonly Readonly<{ step: StepId; batch: InputBatch; pub: number }>[]
  requests: readonly RequestView[]
  adopted: RequestView | null
  voided: readonly FactOf<'intent.voided'>[]
  intents: ReadonlyMap<ActionId, IntentView>
  results: ReadonlyMap<ConsumptionId, ResultView>
  admissions: readonly AdmissionView[]
  handoffs: ReadonlyMap<string, HandoffView>
  batches: ReadonlyMap<ActionBatchId, BatchView>
  passages: ReadonlyMap<PassageId, PassageView>
  controls: ReadonlyMap<AgentOperationId, ControlView>
  waits: Readonly<{ step: StepId; waits: Ref<readonly Waiting[]>; pub: number }> | null
  finish: FinishView
  settlements: readonly Readonly<{
    variant: string
    record: Ref
    evidence: DurableEvidence
    op: AgentOperationId
    pub: number
  }>[]
  observations: readonly Readonly<{
    terminal: DurableEvidence
    passage: PassageId
    implementation: Adoption
    observed: DurableEvidence
    pub: number
  }>[]
  acknowledged: number
  acknowledgedAt: number
  fences: readonly Readonly<{
    operation: string
    guard: Readonly<{
      owner: string
      resource: string
      revision: string
      evidence: DurableEvidence
    }>
    fence: DurableEvidence
    pub: number
  }>[]
  events: readonly EventView[]
  bindings: readonly BindingView[]
  materials: ReadonlyMap<
    string,
    Readonly<{ source: DurableEvidence; value: Ref; consumer: ConsumerRef; pub: number }>
  >
  ops: ReadonlyMap<AgentOperationId, OperationEntry>
  excluded: ReadonlyMap<AgentOperationId, ExclusionEntry>
  rejections: ReadonlyMap<AgentOperationId, RejectionEntry>
  reached: ReadonlyMap<number, AgentOperationId>
}>

export type SessionJournalView = Readonly<{
  head: number
  executions: ReadonlyMap<AgentExecutionId, ExecutionView>
  ops: ReadonlyMap<AgentOperationId, OperationEntry>
  excluded: ReadonlyMap<AgentOperationId, ExclusionEntry>
}>

export const emptySessionView = (): SessionJournalView => ({
  head: 0,
  executions: new Map(),
  ops: new Map(),
  excluded: new Map(),
})

export function emptyExecutionView(execution: AgentExecutionId): ExecutionView {
  return {
    execution,
    revision: 0,
    head: 0,
    gen: '0',
    opened: null,
    attachments: [],
    cursor: {},
    cursorMoved: {},
    inputs: [],
    steps: [],
    requests: [],
    adopted: null,
    voided: [],
    intents: new Map(),
    results: new Map(),
    admissions: [],
    handoffs: new Map(),
    batches: new Map(),
    passages: new Map(),
    controls: new Map(),
    waits: null,
    finish: {
      candidates: [],
      lists: new Map(),
      obligations: new Map(),
      current: null,
      ended: null,
    },
    settlements: [],
    observations: [],
    acknowledged: 0,
    acknowledgedAt: 0,
    fences: [],
    events: [],
    bindings: [],
    materials: new Map(),
    ops: new Map(),
    excluded: new Map(),
    rejections: new Map(),
    reached: new Map(),
  }
}

export const handoffKey = (reference: HandoffReference): string => canonical(reference)

export function openCalls(view: ExecutionView): readonly IntentView[] {
  return [...view.intents.values()].filter(
    intent => view.results.get(intent.pending.consumption)?.received == null,
  )
}

function plain(value: unknown): unknown {
  if (value instanceof Map)
    return Object.fromEntries([...value].map(([key, item]) => [String(key), plain(item)]))
  if (Array.isArray(value)) return value.map(plain)
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]))
  return value
}

export function viewDigest(view: SessionJournalView): string {
  return digestOf(plain(view))
}

export function viewText(view: SessionJournalView): string {
  return canonical(plain(view))
}
