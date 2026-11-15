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
  eventKindOf,
  type ExclusionReason,
  digestOf,
  type AttachmentBasis,
  type Attempt,
  type CursorMembers,
  type FactBody,
  type FactOf,
  type ParticipationKind,
  type ProducerCall,
  type PublishedBatch,
  type Ref,
  type ResultStage,
} from './facts.ts'
import { foldVoided } from './voided.ts'

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

const NO_REVISION: ReadonlySet<string> = new Set([
  'op.recognized',
  'material.preserved',
  'op.excluded',
])

export function advances(batch: PublishedBatch): boolean {
  return batch.envelope.kinds.length > 0 || batch.facts.some(fact => !NO_REVISION.has(fact.kind))
}

type Draft = {
  -readonly [K in keyof ExecutionView]: ExecutionView[K]
} & {
  intents: Map<ActionId, IntentView>
  results: Map<ConsumptionId, ResultView>
  handoffs: Map<string, HandoffView>
  batches: Map<ActionBatchId, BatchView>
  passages: Map<PassageId, PassageView>
  controls: Map<AgentOperationId, ControlView>
  materials: Map<
    string,
    Readonly<{ source: DurableEvidence; value: Ref; consumer: ConsumerRef; pub: number }>
  >
  ops: Map<AgentOperationId, OperationEntry>
  excluded: Map<AgentOperationId, ExclusionEntry>
  rejections: Map<AgentOperationId, RejectionEntry>
  reached: Map<number, AgentOperationId>
  cursor: Partial<CursorMembers>
  cursorMoved: Partial<Record<keyof CursorMembers, number>>
}

function draftOf(view: ExecutionView): Draft {
  return {
    ...view,
    cursor: { ...view.cursor },
    cursorMoved: { ...view.cursorMoved },
    intents: new Map(view.intents),
    results: new Map(view.results),
    handoffs: new Map(view.handoffs),
    batches: new Map(view.batches),
    passages: new Map(view.passages),
    controls: new Map(view.controls),
    materials: new Map(view.materials),
    ops: new Map(view.ops),
    excluded: new Map(view.excluded),
    rejections: new Map(view.rejections),
    reached: new Map(view.reached),
  }
}

function handoffOf(draft: Draft, reference: HandoffReference): HandoffView {
  return (
    draft.handoffs.get(handoffKey(reference)) ?? {
      handoff: reference,
      prepared: null,
      resolved: null,
      retired: null,
      recorded: [],
    }
  )
}

function candidateAt(
  draft: Draft,
  candidate: AgentOperationId,
  change: (view: CandidateView) => CandidateView,
): void {
  const index = draft.finish.candidates.findIndex(item => item.candidate === candidate)
  if (index < 0) return
  const candidates = [...draft.finish.candidates]
  candidates[index] = change(candidates[index]!)
  draft.finish = { ...draft.finish, candidates }
}

function active(draft: Draft): Authority | null {
  const latest = draft.attachments.at(-1)
  return latest?.status === 'active' ? latest.authority : null
}

function eventOf(draft: Draft, fact: FactBody): string | null {
  const kind = eventKindOf(fact)
  if (kind === null || fact.kind !== 'control.stage' || fact.step !== null) return kind
  if (draft.finish.ended !== null) return null
  const current = draft.controls.get(fact.control)?.stages[fact.stage]
  const same =
    current !== undefined &&
    current.state === fact.state &&
    canonical(current.source) === canonical(fact.source)
  return same ? null : kind
}

function apply(draft: Draft, fact: FactBody, pub: number, ord: number, revision: number): void {
  const event = eventOf(draft, fact)
  switch (fact.kind) {
    case 'exec.opened':
      draft.opened = { ...fact, pub }
      break
    case 'exec.attached': {
      const attachments = draft.attachments.map(item =>
        item.status === 'active' ? { ...item, status: 'superseded' as const } : item,
      )
      attachments.push({
        authority: fact.authority,
        grant: fact.grant,
        basis: fact.basis,
        status: 'active',
        handoff: null,
        handoffRevision: 0,
        pub,
      })
      draft.attachments = attachments
      draft.gen = fact.authority.generation
      break
    }
    case 'exec.detached':
      draft.attachments = draft.attachments.map(item =>
        item.authority.executionAttachment === fact.attachment && item.status === 'active'
          ? {
              ...item,
              status: 'detached' as const,
              handoff: fact.handoff,
              handoffRevision: revision,
            }
          : item,
      )
      break
    case 'input.accepted':
      if (!draft.inputs.some(item => item.input === fact.input))
        draft.inputs = [
          ...draft.inputs,
          {
            input: fact.input,
            entry: fact.entry,
            message: fact.message,
            source: fact.source,
            priority: fact.priority,
            watermark: fact.watermark,
            pub,
            revision,
          },
        ]
      break
    case 'step.begun':
      draft.steps = [...draft.steps, { step: fact.step, batch: fact.batch, pub }]
      break
    case 'request.adopted': {
      const request: RequestView = {
        step: fact.step,
        attempt: fact.attempt,
        reference: fact.reference,
        fixed: fact.fixed,
        schema: fact.schema,
        record: fact.record,
        coverage: fact.coverage,
        voided: null,
        pub,
      }
      draft.requests = [...draft.requests, request]
      draft.adopted = request
      break
    }
    case 'intent.voided':
      Object.assign(draft, foldVoided(draft, fact))
      break
    case 'call.intended':
      if (!draft.intents.has(fact.action))
        draft.intents.set(fact.action, {
          action: fact.action,
          step: fact.step,
          pending: fact.pending,
          authority: fact.authority,
          request: fact.request,
          association: null,
          judgment: null,
          settlement: null,
          pub,
        })
      break
    case 'call.associated': {
      const intent = draft.intents.get(fact.action)
      if (intent !== undefined && intent.association === null)
        draft.intents.set(fact.action, {
          ...intent,
          association: { reference: fact.reference, receipt: fact.receipt },
          pending:
            intent.pending.kind === 'tool'
              ? { ...intent.pending, association: 'associated', reference: fact.reference }
              : intent.pending,
        })
      break
    }
    case 'result.received': {
      const known = draft.results.get(fact.consumption)
      draft.results.set(fact.consumption, {
        consumption: fact.consumption,
        result: known?.result ?? fact.result,
        received: known?.received ?? {
          delivery: fact.delivery,
          consumer: fact.consumer,
          custody: fact.custody,
          saved: fact.saved,
          material: fact.material,
          pub,
        },
        stages: known?.stages ?? {},
        pub,
      })
      break
    }
    case 'result.handled': {
      const known = draft.results.get(fact.consumption)
      const stages: Partial<Record<ResultStage, DurableEvidence>> = { ...known?.stages }
      if (stages[fact.stage] === undefined) stages[fact.stage] = fact.evidence
      draft.results.set(fact.consumption, {
        consumption: fact.consumption,
        result: known?.result ?? fact.result,
        received: known?.received ?? null,
        stages,
        pub,
      })
      break
    }
    case 'reply.judged':
      if (!draft.admissions.some(item => item.sequence === fact.sequence))
        draft.admissions = [
          ...draft.admissions,
          {
            sequence: fact.sequence,
            fact: fact.fact,
            basis: fact.basis,
            publication: fact.publication,
            message: fact.message,
            source: fact.source,
            history: fact.history,
            pub,
            revision,
          },
        ]
      break
    case 'message.published':
      break
    case 'handoff.prepared': {
      const handoff = handoffOf(draft, fact.handoff)
      if (handoff.prepared === null)
        draft.handoffs.set(handoffKey(fact.handoff), {
          ...handoff,
          prepared: { request: fact.request, prepared: fact.prepared, pub },
        })
      break
    }
    case 'handoff.resolved': {
      const handoff = handoffOf(draft, fact.handoff)
      if (handoff.resolved === null)
        draft.handoffs.set(handoffKey(fact.handoff), {
          ...handoff,
          resolved: {
            resolution: fact.resolution,
            outcome: fact.outcome,
            history: fact.history,
            pub,
            revision,
          },
        })
      break
    }
    case 'handoff.retired': {
      const handoff = handoffOf(draft, fact.handoff)
      if (handoff.retired === null)
        draft.handoffs.set(handoffKey(fact.handoff), {
          ...handoff,
          retired: { reason: fact.reason, excluded: fact.excluded, pub, revision },
        })
      break
    }
    case 'handoff.recorded': {
      const handoff = handoffOf(draft, fact.handoff)
      const op = draft.ops.size === 0 ? null : [...draft.ops.keys()].at(-1)
      draft.handoffs.set(handoffKey(fact.handoff), {
        ...handoff,
        recorded: [
          ...handoff.recorded,
          {
            resolution: fact.resolution,
            outcome: fact.outcome,
            predecessor: fact.predecessor,
            custody: fact.custody,
            op: op as AgentOperationId,
            pub,
          },
        ],
      })
      break
    }
    case 'batch.fixed':
      if (!draft.batches.has(fact.batch))
        draft.batches.set(fact.batch, {
          batch: fact.batch,
          step: fact.step,
          source: fact.source,
          actions: fact.actions,
          pub,
        })
      break
    case 'action.judged': {
      const intent = draft.intents.get(fact.action)
      if (intent !== undefined)
        draft.intents.set(fact.action, {
          ...intent,
          judgment: {
            judgment: fact.judgment,
            evidence: fact.evidence,
            passage: fact.passage,
            request: fact.request,
          },
        })
      break
    }
    case 'slot.settled': {
      const intent = draft.intents.get(fact.action)
      if (intent !== undefined && intent.settlement === null)
        draft.intents.set(fact.action, { ...intent, settlement: fact.settlement })
      break
    }
    case 'passage.declared':
      if (!draft.passages.has(fact.passage))
        draft.passages.set(fact.passage, {
          passage: fact.passage,
          subject: fact.subject,
          declared: fact.declared,
          progress: [],
          conclusion: null,
          pub,
        })
      break
    case 'passage.progressed': {
      const passage = draft.passages.get(fact.passage)
      if (passage !== undefined)
        draft.passages.set(fact.passage, {
          ...passage,
          progress: [...passage.progress, { progress: fact.progress, round: fact.round, pub }],
        })
      break
    }
    case 'passage.concluded': {
      const passage = draft.passages.get(fact.passage)
      if (passage !== undefined && passage.conclusion === null)
        draft.passages.set(fact.passage, {
          ...passage,
          conclusion: { conclusion: fact.conclusion, evidence: fact.evidence, pub },
        })
      break
    }
    case 'control.stage': {
      const known = draft.controls.get(fact.control)
      const stages: {
        -readonly [K in ControlStage]?: Readonly<{
          state: 'reached' | 'unresolved'
          source: DurableEvidence
        }>
      } = { ...known?.stages }
      const current = stages[fact.stage]
      if (current === undefined || (current.state === 'unresolved' && fact.state === 'reached'))
        stages[fact.stage] = { state: fact.state, source: fact.source }
      draft.controls.set(fact.control, {
        control: fact.control,
        command: known?.command ?? fact.command,
        toolInvocation: known?.toolInvocation ?? fact.toolInvocation,
        toolOperation: known?.toolOperation ?? fact.toolOperation,
        stages,
        rejected: known?.rejected ?? [],
        pub,
      })
      break
    }
    case 'control.rejected': {
      const known = draft.controls.get(fact.control)
      if (known !== undefined)
        draft.controls.set(fact.control, {
          ...known,
          rejected: [...known.rejected, fact.audit],
          pub,
        })
      const op = [...draft.ops.keys()].at(-1)
      if (op !== undefined && !draft.rejections.has(op))
        draft.rejections.set(op, { control: fact.control, audit: fact.audit, pub, revision })
      break
    }
    case 'wait.entered':
      draft.waits = { step: fact.step, waits: fact.waits, pub }
      break
    case 'target.bound': {
      const definition = draft.cursor.definition ?? draft.opened?.definition
      if (definition === undefined)
        throw new TypeError('a call binding requires its original Agent definition')
      draft.bindings = [
        ...draft.bindings,
        {
          definition,
          reference: fact.reference,
          pending: fact.pending,
          instance: fact.instance,
          pub,
        },
      ]
      break
    }
    case 'finish.candidate':
      if (!draft.finish.candidates.some(item => item.candidate === fact.candidate))
        draft.finish = {
          ...draft.finish,
          candidates: [
            ...draft.finish.candidates,
            {
              candidate: fact.candidate,
              claim: fact.claim,
              cursor: fact.cursor,
              route: fact.route,
              path: fact.path,
              supersedes: fact.supersedes,
              beforeTerminal: null,
              pub,
              revision,
            },
          ],
          current: fact.candidate,
        }
      break
    case 'finish.proved': {
      const candidate = draft.finish.candidates.find(
        item => item.route.record === fact.route.record,
      )
      if (candidate !== undefined && candidate.beforeTerminal === null)
        candidateAt(draft, candidate.candidate, item => ({
          ...item,
          beforeTerminal: fact.beforeTerminal,
        }))
      break
    }
    case 'finish.obligation': {
      const obligations = new Map(draft.finish.obligations)
      obligations.set(fact.id, { category: fact.category, item: fact.item, pub })
      draft.finish = { ...draft.finish, obligations }
      break
    }
    case 'finish.obligations': {
      const key = listKey(fact.candidate, fact.list)
      if (draft.finish.lists.has(key)) break
      const lists = new Map(draft.finish.lists)
      lists.set(key, {
        candidate: fact.candidate,
        list: fact.list,
        issued: {
          count: fact.count,
          evidence: fact.evidence,
          coverage: fact.coverage,
          listed: fact.listed,
          op: [...draft.ops.keys()].at(-1) as AgentOperationId,
          pub,
          revision,
        },
      })
      draft.finish = { ...draft.finish, lists }
      break
    }
    case 'finish.ended':
      if (draft.finish.ended === null)
        draft.finish = {
          ...draft.finish,
          ended: {
            candidate: fact.candidate,
            conclusion: fact.conclusion,
            disposition: fact.disposition,
            pub,
            revision,
          },
        }
      break
    case 'settlement.recorded': {
      const op = [...draft.ops.keys()].at(-1) ?? null
      draft.settlements = [
        ...draft.settlements,
        {
          variant: fact.variant,
          record: fact.record,
          evidence: fact.evidence,
          op: op as AgentOperationId,
          pub,
        },
      ]
      break
    }
    case 'observation.recorded':
      if (!draft.observations.some(item => item.passage === fact.passage))
        draft.observations = [...draft.observations, { ...fact, pub }]
      break
    case 'ack.through':
      if (fact.sequence > draft.acknowledged) {
        draft.acknowledged = fact.sequence
        draft.acknowledgedAt = revision
      }
      break
    case 'op.recognized':
      break
    case 'material.preserved': {
      const key = canonical(fact.source)
      if (!draft.materials.has(key))
        draft.materials.set(key, {
          source: fact.source,
          value: fact.value,
          consumer: fact.consumer,
          pub,
        })
      break
    }
    case 'op.excluded':
      if (!draft.ops.has(fact.operation) && !draft.excluded.has(fact.operation))
        draft.excluded.set(fact.operation, {
          execution: draft.execution,
          reason: fact.reason,
          evidence: fact.evidence,
          predecessor: fact.predecessor,
          pub,
        })
      break
    case 'fence.started':
      if (!draft.fences.some(item => item.operation === fact.operation))
        draft.fences = [
          ...draft.fences,
          { operation: fact.operation, guard: fact.guard, fence: fact.fence, pub },
        ]
      break
    case 'cursor.moved':
      for (const [name, value] of Object.entries(fact.members) as [
        keyof CursorMembers,
        CursorMembers[keyof CursorMembers],
      ][]) {
        ;(draft.cursor as Record<string, unknown>)[name] = value
        draft.cursorMoved[name] = pub
      }
      break
    default: {
      const _exhaustive: never = fact
      return _exhaustive
    }
  }
  if (event !== null)
    draft.events = [
      ...draft.events,
      {
        eseq: draft.events.length + 1,
        kind: event,
        pub,
        ord,
        revision,
        attachment: active(draft),
        fact,
      },
    ]
}

export function fold(view: SessionJournalView, batch: PublishedBatch): SessionJournalView {
  if (batch.pub <= view.head) return view
  const draft = draftOf(view.executions.get(batch.execution) ?? emptyExecutionView(batch.execution))
  // Write the operation index before the facts, so facts that name this batch's op can read it.
  const moves = advances(batch)
  const revision =
    batch.envelope.rev >= 1 ? batch.envelope.rev : moves ? draft.revision + 1 : draft.revision
  const recognition = batch.facts.find(fact => fact.kind === 'op.recognized')
  const target = recognition?.kind === 'op.recognized' ? recognition.target : null
  const answered =
    target === null
      ? revision
      : (draft.ops.get(target)?.revision ?? view.ops.get(target)?.revision ?? revision)
  const entry: OperationEntry = {
    execution: batch.execution,
    digest: batch.envelope.digest,
    pub: batch.pub,
    revision: answered,
    target,
    recalls: recognition?.kind === 'op.recognized' && recognition.recalls === true,
    kinds: batch.envelope.kinds,
  }
  if (!draft.ops.has(batch.envelope.op)) draft.ops.set(batch.envelope.op, entry)
  if (moves && !draft.reached.has(revision)) draft.reached.set(revision, batch.envelope.op)
  draft.revision = revision
  draft.head = batch.pub
  for (const [index, fact] of batch.facts.entries())
    apply(draft, fact, batch.pub, index + 1, revision)
  const executions = new Map(view.executions)
  executions.set(batch.execution, draft)
  const ops = view.ops.has(batch.envelope.op)
    ? view.ops
    : new Map(view.ops).set(batch.envelope.op, entry)
  const excluded = new Map(view.excluded)
  for (const [operation, exclusion] of draft.excluded)
    if (!excluded.has(operation) && !ops.has(operation)) excluded.set(operation, exclusion)
  return { head: batch.pub, executions, ops, excluded }
}

export function foldAll(
  batches: Iterable<PublishedBatch>,
  view: SessionJournalView = emptySessionView(),
): SessionJournalView {
  let current = view
  for (const batch of batches) current = fold(current, batch)
  return current
}

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
