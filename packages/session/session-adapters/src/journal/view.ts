import { SharedMap, isTable } from './shared-map.ts'
import type {
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
  type HoldKind,
  type FactBody,
  type FactOf,
  type ParticipationKind,
  type ProducerCall,
  type Ref,
  type ResultKey,
  type ResultStage,
} from './facts.ts'

// The batch that wrote an entry, as its receipt names it: an entry a receipt is read from carries it.
export type Stamp = Readonly<{
  op: AgentOperationId
  digest: string
  pub: number
  revision: number
}>

// A voided intent as the view holds it: in the order the batches voided them.
export type VoidedView = FactOf<'intent.voided'> & Readonly<{ pub: number; ord: number }>

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
  place: number
  entry: AgentOperationId
  message: Ref
  source: DurableEvidence | null
  priority: 'ordinary' | 'urgent'
  watermark: DurableEvidence
  pub: number
  revision: number
}>

export type MaterialView = Readonly<{
  source: DurableEvidence
  value: Ref
  consumer: ConsumerRef
  qualifier: AgentExecutionId | null
  pub: number
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
  pub: number
  op: AgentOperationId
}>

export type ResultView = Readonly<{
  consumption: ConsumptionId
  result: ProducerCall
  received:
    | (Readonly<{
        delivery: string
        consumer: ConsumerRef
        custody: Ref
        saved: DurableEvidence
        material: Ref | null
      }> &
        Stamp)
    | null
  stages: Readonly<Partial<Record<ResultStage, DurableEvidence>>>
  pub: number
}>

export type ReceivedView = NonNullable<ResultView['received']>

export type AdmittedView = Readonly<{
  consecutive: number
  total: number
  last: DurableEvidence | null
  sequence: number
  basis: DurableEvidence | null
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
  prepared: Readonly<{ request: Ref; prepared: DurableEvidence; pub: number; step: StepId }> | null
  resolved:
    | (Readonly<{
        resolution: 'recorded' | 'excluded'
        outcome: Ref
        history: DurableEvidence | null
      }> &
        Stamp)
    | null
  retired:
    | (Readonly<{
        reason: DurableEvidence
        excluded: Ref
      }> &
        Stamp)
    | null
}>

export type CustodyView = Readonly<{
  handoff: HandoffReference
  resolution: 'recorded' | 'excluded'
  outcome: Ref
  predecessor: AgentOperationId | null
  custody: Ref | null
  op: AgentOperationId
  pub: number
}>

export type HoldView = Readonly<{
  kind: HoldKind
  id: string
  pub: number
  ord: number
  released: boolean
}>

export type ControlView = Readonly<{
  control: AgentOperationId
  command: ExecutionControl
  modelInvocation: ModelInvocationRef | null
  toolInvocation: ToolInvocationRef | null
  toolOperation: ToolOperationRef | null
  stages: Readonly<
    Partial<
      Record<
        ControlStage,
        Readonly<{ state: 'reached' | 'unresolved'; source: DurableEvidence }> & Stamp
      >
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

export type ObligationView = Readonly<{
  category: string
  item: Ref | null
  settled: boolean
  pub: number
}>

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
  entry: number | null
  kind: string
  ord: number
  attachment: Authority | null
  fact: FactBody
}> &
  Stamp

export type BindingView = Readonly<{
  definition: Adoption
  reference: string
  pending: Ref<PendingCall>
  consumption: ConsumptionId
  instance: AgentInstanceId
  pub: number
  ord: number
}>

export type ExclusionEntry = Readonly<{
  execution: AgentExecutionId
  reason: ExclusionReason
  evidence: DurableEvidence
  predecessor: AgentOperationId | null
  pub: number
  // A later batch of the operation revived it: the exclusion no longer holds.
  revived?: true
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
    revision: number
  }> | null
  attachments: readonly AttachmentView[]
  cursor: Readonly<Partial<CursorMembers>>
  cursorMoved: Readonly<Partial<Record<keyof CursorMembers, number>>>
  holds: readonly HoldView[]
  holdsJudged: number
  inputs: readonly InputView[]
  steps: readonly Readonly<{ step: StepId; batch: InputBatch; pub: number }>[]
  requests: readonly RequestView[]
  adopted: RequestView | null
  voided: readonly VoidedView[]
  intents: ReadonlyMap<ActionId, IntentView>
  results: ReadonlyMap<ResultKey, ResultView>
  admissions: readonly AdmissionView[]
  handoffs: ReadonlyMap<string, HandoffView>
  custodies: ReadonlyMap<string, CustodyView>
  controls: ReadonlyMap<AgentOperationId, ControlView>
  waits: Readonly<{ step: StepId; waits: Ref<readonly Waiting[]>; pub: number }> | null
  finish: FinishView
  settlements: readonly (Readonly<{
    variant: string
    record: Ref
    evidence: DurableEvidence
  }> &
    Stamp)[]
  observations: readonly (Readonly<{
    terminal: DurableEvidence
    passage: PassageId
    implementation: Adoption
    observed: DurableEvidence
  }> &
    Stamp)[]
  acknowledged: number
  acknowledgedAt: number
  emitted: number
  entries: number
  accepted: number
  /** The reply admission ledger the admissions fold into: the open ones are only its tail. */
  admitted: AdmittedView
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
    ord: number
  }>[]
  events: readonly EventView[]
  bindings: readonly BindingView[]
  materials: ReadonlyMap<string, MaterialView>
  ops: ReadonlyMap<AgentOperationId, OperationEntry>
  excluded: ReadonlyMap<AgentOperationId, ExclusionEntry>
  rejections: ReadonlyMap<AgentOperationId, RejectionEntry>
  reached: ReadonlyMap<number, Stamp>
}>

export type SessionJournalView = Readonly<{
  head: number
  executions: ReadonlyMap<AgentExecutionId, ExecutionView>
}>

export const emptySessionView = (): SessionJournalView => ({
  head: 0,
  executions: new SharedMap(),
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
    holds: [],
    holdsJudged: 0,
    inputs: [],
    steps: [],
    requests: [],
    adopted: null,
    voided: [],
    intents: new SharedMap(),
    results: new SharedMap(),
    admissions: [],
    handoffs: new SharedMap(),
    custodies: new SharedMap(),
    controls: new SharedMap(),
    waits: null,
    finish: {
      candidates: [],
      lists: new SharedMap(),
      obligations: new SharedMap(),
      current: null,
      ended: null,
    },
    settlements: [],
    observations: [],
    acknowledged: 0,
    acknowledgedAt: 0,
    emitted: 0,
    accepted: 0,
    entries: 0,
    admitted: { consecutive: 0, total: 0, last: null, sequence: 0, basis: null },
    fences: [],
    events: [],
    bindings: [],
    materials: new SharedMap(),
    ops: new SharedMap(),
    excluded: new SharedMap(),
    rejections: new SharedMap(),
    reached: new SharedMap(),
  }
}

export const handoffKey = (reference: HandoffReference): string => canonical(reference)

export const custodiesUnder = (reference: HandoffReference): string => `${handoffKey(reference)}/`
export const custodyKey = (reference: HandoffReference, attempt: AgentOperationId): string =>
  `${custodiesUnder(reference)}${attempt}`

/** The deliveries each consumption received, in the order they came. */
export function receivedBy(view: ExecutionView): Map<ConsumptionId, ReceivedView[]> {
  const by = new Map<ConsumptionId, ReceivedView[]>()
  const add = (consumption: ConsumptionId, received: ReceivedView | null) => {
    if (received !== null) by.set(consumption, [...(by.get(consumption) ?? []), received])
  }
  for (const item of view.results.values()) add(item.consumption, item.received)
  for (const list of by.values()) list.sort((left, right) => left.pub - right.pub)
  return by
}

/** Every received delivery that holds custody of an entry. */
export function receivedViews(view: ExecutionView): readonly ReceivedView[] {
  return [...view.results.values()].flatMap(item => (item.received === null ? [] : [item.received]))
}

function plain(value: unknown): unknown {
  if (isTable(value))
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
