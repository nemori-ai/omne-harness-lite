import type {
  ActionId,
  AgentOperationId,
  Authority,
  ConsumptionId,
  ControlStage,
  DurableEvidence,
  HandoffReference,
} from '@omne-harness/agent-contract'
import { canonical } from '../testing/canonical.ts'
import {
  eventKindOf,
  type CursorMembers,
  type FactBody,
  type FactOf,
  type PublishedBatch,
  type ResultStage,
} from './facts.ts'
import {
  emptyExecutionView,
  emptySessionView,
  handoffKey,
  listKey,
  type CandidateView,
  type ControlView,
  type ExclusionEntry,
  type ExecutionView,
  type HandoffView,
  type IntentView,
  type MaterialView,
  type OperationEntry,
  type RejectionEntry,
  type RequestView,
  type ResultView,
  type ReceivedView,
  type SessionJournalView,
  type Stamp,
} from './view.ts'
import { foldVoided } from './voided.ts'
import { forkOf, forkTrackedOf } from './shared-map.ts'
import { closings, evicted, itemChanges, type ItemChange } from './items.ts'

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
  placeholders: Map<ConsumptionId, ReceivedView>
  deliveries: Map<ConsumptionId, readonly ReceivedView[]>
  handoffs: Map<string, HandoffView>
  controls: Map<AgentOperationId, ControlView>
  materials: Map<string, MaterialView>
  ops: Map<AgentOperationId, OperationEntry>
  excluded: Map<AgentOperationId, ExclusionEntry>
  rejections: Map<AgentOperationId, RejectionEntry>
  reached: Map<number, Stamp>
  cursor: Partial<CursorMembers>
  cursorMoved: Partial<Record<keyof CursorMembers, number>>
}

function draftOf(view: ExecutionView): Draft {
  return {
    ...view,
    cursor: { ...view.cursor },
    cursorMoved: { ...view.cursorMoved },
    intents: forkTrackedOf(view.intents),
    results: forkTrackedOf(view.results),
    placeholders: forkTrackedOf(view.placeholders),
    deliveries: forkTrackedOf(view.deliveries),
    handoffs: forkTrackedOf(view.handoffs),
    controls: forkTrackedOf(view.controls),
    materials: forkTrackedOf(view.materials),
    ops: forkTrackedOf(view.ops),
    excluded: forkTrackedOf(view.excluded),
    rejections: forkTrackedOf(view.rejections),
    reached: forkTrackedOf(view.reached),
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

// The writer appends no event after the execution ended (a result received then is kept only),
// and a control stage it already reached appends none either.
function eventOf(draft: Draft, fact: FactBody): string | null {
  const kind = eventKindOf(fact)
  if (kind === null || draft.finish.ended !== null) return null
  if (fact.kind !== 'control.stage' || fact.step !== null) return kind
  const current = draft.controls.get(fact.control)?.stages[fact.stage]
  const same =
    current !== undefined &&
    current.state === fact.state &&
    canonical(current.source) === canonical(fact.source)
  return same ? null : kind
}

function foldExecAttached(draft: Draft, fact: FactOf<'exec.attached'>, pub: number): void {
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
}

function foldExecDetached(draft: Draft, fact: FactOf<'exec.detached'>, revision: number): void {
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
}

function foldInputAccepted(
  draft: Draft,
  fact: FactOf<'input.accepted'>,
  pub: number,
  revision: number,
): void {
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
}

function foldRequestAdopted(draft: Draft, fact: FactOf<'request.adopted'>, pub: number): void {
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
}

function foldCallIntended(draft: Draft, fact: FactOf<'call.intended'>, stamp: Stamp): void {
  if (!draft.intents.has(fact.action))
    draft.intents.set(fact.action, {
      action: fact.action,
      step: fact.step,
      pending: fact.pending,
      authority: fact.authority,
      request: fact.request,
      pub: stamp.pub,
      op: stamp.op,
    })
}

function foldResultReceived(draft: Draft, fact: FactOf<'result.received'>, stamp: Stamp): void {
  const received: ReceivedView = {
    delivery: fact.delivery,
    consumer: fact.consumer,
    custody: fact.custody,
    saved: fact.saved,
    material: fact.material,
    ...stamp,
  }
  draft.deliveries.set(fact.consumption, [
    ...(draft.deliveries.get(fact.consumption) ?? []),
    received,
  ])
  if (fact.result.delivery === 'placeholder') {
    if (!draft.placeholders.has(fact.consumption))
      draft.placeholders.set(fact.consumption, received)
    return
  }
  const known = draft.results.get(fact.consumption)
  draft.results.set(fact.consumption, {
    consumption: fact.consumption,
    result: known?.result ?? fact.result,
    received: known?.received ?? received,
    stages: known?.stages ?? {},
    pub: stamp.pub,
  })
}

function foldResultHandled(draft: Draft, fact: FactOf<'result.handled'>, pub: number): void {
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
}

function foldReplyJudged(
  draft: Draft,
  fact: FactOf<'reply.judged'>,
  pub: number,
  revision: number,
): void {
  if (fact.sequence <= draft.admitted.sequence) return
  const known = draft.admitted
  draft.admitted =
    fact.fact.decision === 'rejected'
      ? { ...known, consecutive: known.consecutive + 1, total: known.total + 1 }
      : { ...known, consecutive: 0, last: fact.fact.source }
  draft.admitted = { ...draft.admitted, sequence: fact.sequence, basis: fact.basis }
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
}

function foldHandoffPrepared(draft: Draft, fact: FactOf<'handoff.prepared'>, pub: number): void {
  const handoff = handoffOf(draft, fact.handoff)
  if (handoff.prepared === null)
    draft.handoffs.set(handoffKey(fact.handoff), {
      ...handoff,
      prepared: { request: fact.request, prepared: fact.prepared, pub, step: fact.step },
    })
}

function foldHandoffResolved(draft: Draft, fact: FactOf<'handoff.resolved'>, stamp: Stamp): void {
  const handoff = handoffOf(draft, fact.handoff)
  if (handoff.resolved === null)
    draft.handoffs.set(handoffKey(fact.handoff), {
      ...handoff,
      resolved: {
        resolution: fact.resolution,
        outcome: fact.outcome,
        history: fact.history,
        ...stamp,
      },
    })
}

function foldHandoffRetired(draft: Draft, fact: FactOf<'handoff.retired'>, stamp: Stamp): void {
  const handoff = handoffOf(draft, fact.handoff)
  if (handoff.retired === null)
    draft.handoffs.set(handoffKey(fact.handoff), {
      ...handoff,
      retired: { reason: fact.reason, excluded: fact.excluded, ...stamp },
    })
}

function foldHandoffRecorded(draft: Draft, fact: FactOf<'handoff.recorded'>, stamp: Stamp): void {
  const handoff = handoffOf(draft, fact.handoff)
  const { op, pub } = stamp
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
}

function foldControlStage(draft: Draft, fact: FactOf<'control.stage'>, stamp: Stamp): void {
  const known = draft.controls.get(fact.control)
  const stages: {
    -readonly [K in ControlStage]?: Readonly<{
      state: 'reached' | 'unresolved'
      source: DurableEvidence
    }> &
      Stamp
  } = { ...known?.stages }
  const current = stages[fact.stage]
  if (current === undefined || (current.state === 'unresolved' && fact.state === 'reached'))
    stages[fact.stage] = { state: fact.state, source: fact.source, ...stamp }
  draft.controls.set(fact.control, {
    control: fact.control,
    command: known?.command ?? fact.command,
    modelInvocation: known?.modelInvocation ?? fact.modelInvocation,
    toolInvocation: known?.toolInvocation ?? fact.toolInvocation,
    toolOperation: known?.toolOperation ?? fact.toolOperation,
    stages,
    rejected: known?.rejected ?? [],
    pub: stamp.pub,
  })
}

function foldControlRejected(draft: Draft, fact: FactOf<'control.rejected'>, stamp: Stamp): void {
  const { op, pub, revision } = stamp
  const known = draft.controls.get(fact.control)
  if (known !== undefined)
    draft.controls.set(fact.control, {
      ...known,
      rejected: [...known.rejected, fact.audit],
      pub,
    })
  if (!draft.rejections.has(op))
    draft.rejections.set(op, { control: fact.control, audit: fact.audit, pub, revision })
}

function foldTargetBound(
  draft: Draft,
  fact: FactOf<'target.bound'>,
  pub: number,
  ord: number,
): void {
  const definition = draft.cursor.definition ?? draft.opened?.definition
  if (definition === undefined)
    throw new TypeError('a call binding requires its original Agent definition')
  draft.bindings = [
    ...draft.bindings,
    {
      definition,
      reference: fact.reference,
      pending: fact.pending,
      consumption: fact.consumption,
      instance: fact.instance,
      pub,
      ord,
    },
  ]
}

function foldFinishCandidate(
  draft: Draft,
  fact: FactOf<'finish.candidate'>,
  pub: number,
  revision: number,
): void {
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
}

function foldFinishProved(draft: Draft, fact: FactOf<'finish.proved'>): void {
  const candidate = draft.finish.candidates.find(item => item.route.record === fact.route.record)
  if (candidate !== undefined && candidate.beforeTerminal === null)
    candidateAt(draft, candidate.candidate, item => ({
      ...item,
      beforeTerminal: fact.beforeTerminal,
    }))
}

function foldFinishObligation(draft: Draft, fact: FactOf<'finish.obligation'>, pub: number): void {
  const obligations = forkTrackedOf(draft.finish.obligations)
  obligations.set(fact.id, {
    category: fact.category,
    item: fact.item,
    settled: fact.settled,
    pub,
  })
  draft.finish = { ...draft.finish, obligations }
}

function foldFinishObligations(
  draft: Draft,
  fact: FactOf<'finish.obligations'>,
  stamp: Stamp,
): void {
  const { op, pub, revision } = stamp
  const key = listKey(fact.candidate, fact.list)
  if (draft.finish.lists.has(key)) return
  const lists = forkTrackedOf(draft.finish.lists)
  lists.set(key, {
    candidate: fact.candidate,
    list: fact.list,
    issued: {
      count: fact.count,
      evidence: fact.evidence,
      coverage: fact.coverage,
      listed: fact.listed,
      op,
      pub,
      revision,
    },
  })
  draft.finish = { ...draft.finish, lists }
}

function foldFinishEnded(
  draft: Draft,
  fact: FactOf<'finish.ended'>,
  pub: number,
  revision: number,
): void {
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
}

function foldSettlementRecorded(
  draft: Draft,
  fact: FactOf<'settlement.recorded'>,
  stamp: Stamp,
): void {
  draft.settlements = [
    ...draft.settlements,
    { variant: fact.variant, record: fact.record, evidence: fact.evidence, ...stamp },
  ]
}

function foldObservationRecorded(
  draft: Draft,
  fact: FactOf<'observation.recorded'>,
  stamp: Stamp,
): void {
  if (!draft.observations.some(item => item.passage === fact.passage))
    draft.observations = [...draft.observations, { ...fact, ...stamp }]
}

function foldAckThrough(draft: Draft, fact: FactOf<'ack.through'>, revision: number): void {
  if (fact.sequence > draft.acknowledged) {
    draft.acknowledged = fact.sequence
    draft.acknowledgedAt = revision
  }
}

function foldMaterialPreserved(
  draft: Draft,
  fact: FactOf<'material.preserved'>,
  pub: number,
): void {
  const key = canonical(fact.source)
  if (!draft.materials.has(key))
    draft.materials.set(key, {
      source: fact.source,
      value: fact.value,
      consumer: fact.consumer,
      qualifier: fact.qualifier,
      pub,
    })
}

function foldOpExcluded(draft: Draft, fact: FactOf<'op.excluded'>, pub: number): void {
  if (!draft.excluded.has(fact.operation))
    draft.excluded.set(fact.operation, {
      execution: draft.execution,
      reason: fact.reason,
      evidence: fact.evidence,
      predecessor: fact.predecessor,
      pub,
    })
}

function foldFenceStarted(
  draft: Draft,
  fact: FactOf<'fence.started'>,
  pub: number,
  ord: number,
): void {
  if (!draft.fences.some(item => item.operation === fact.operation))
    draft.fences = [
      ...draft.fences,
      { operation: fact.operation, guard: fact.guard, fence: fact.fence, pub, ord },
    ]
}

function foldCursorMoved(draft: Draft, fact: FactOf<'cursor.moved'>, pub: number): void {
  for (const [name, value] of Object.entries(fact.members) as [
    keyof CursorMembers,
    CursorMembers[keyof CursorMembers],
  ][]) {
    ;(draft.cursor as Record<string, unknown>)[name] = value
    draft.cursorMoved[name] = pub
  }
}

function apply(draft: Draft, fact: FactBody, stamp: Stamp, ord: number): void {
  const { pub, revision } = stamp
  const event = eventOf(draft, fact)
  switch (fact.kind) {
    case 'exec.opened':
      draft.opened = { ...fact, pub, revision }
      break
    case 'exec.attached':
      foldExecAttached(draft, fact, pub)
      break
    case 'exec.detached':
      foldExecDetached(draft, fact, revision)
      break
    case 'input.accepted':
      foldInputAccepted(draft, fact, pub, revision)
      break
    case 'step.begun':
      draft.steps = [...draft.steps, { step: fact.step, batch: fact.batch, pub }]
      break
    case 'request.adopted':
      foldRequestAdopted(draft, fact, pub)
      break
    case 'intent.voided':
      Object.assign(draft, foldVoided(draft, fact, pub, ord))
      break
    case 'call.intended':
      foldCallIntended(draft, fact, stamp)
      break
    case 'result.received':
      foldResultReceived(draft, fact, stamp)
      break
    case 'result.handled':
      foldResultHandled(draft, fact, pub)
      break
    case 'reply.judged':
      foldReplyJudged(draft, fact, pub, revision)
      break
    case 'message.published':
      break
    case 'handoff.prepared':
      foldHandoffPrepared(draft, fact, pub)
      break
    case 'handoff.resolved':
      foldHandoffResolved(draft, fact, stamp)
      break
    case 'handoff.retired':
      foldHandoffRetired(draft, fact, stamp)
      break
    case 'handoff.recorded':
      foldHandoffRecorded(draft, fact, stamp)
      break
    case 'control.stage':
      foldControlStage(draft, fact, stamp)
      break
    case 'control.rejected':
      foldControlRejected(draft, fact, stamp)
      break
    case 'wait.entered':
      draft.waits = { step: fact.step, waits: fact.waits, pub }
      break
    case 'target.bound':
      foldTargetBound(draft, fact, pub, ord)
      break
    case 'finish.candidate':
      foldFinishCandidate(draft, fact, pub, revision)
      break
    case 'finish.proved':
      foldFinishProved(draft, fact)
      break
    case 'finish.obligation':
      foldFinishObligation(draft, fact, pub)
      break
    case 'finish.obligations':
      foldFinishObligations(draft, fact, stamp)
      break
    case 'finish.ended':
      foldFinishEnded(draft, fact, pub, revision)
      break
    case 'settlement.recorded':
      foldSettlementRecorded(draft, fact, stamp)
      break
    case 'observation.recorded':
      foldObservationRecorded(draft, fact, stamp)
      break
    case 'ack.through':
      foldAckThrough(draft, fact, revision)
      break
    case 'op.recognized':
      break
    case 'material.preserved':
      foldMaterialPreserved(draft, fact, pub)
      break
    case 'op.excluded':
      foldOpExcluded(draft, fact, pub)
      break
    case 'fence.started':
      foldFenceStarted(draft, fact, pub, ord)
      break
    case 'cursor.moved':
      foldCursorMoved(draft, fact, pub)
      break
    default: {
      const _exhaustive: never = fact
      return _exhaustive
    }
  }
  if (event !== null) {
    const entry = fact.kind === 'result.received' || fact.kind === 'fence.started'
    draft.emitted += 1
    if (entry) draft.entries += 1
    draft.events = [
      ...draft.events,
      {
        eseq: draft.emitted,
        entry: entry ? draft.entries : null,
        kind: event,
        ord,
        attachment: active(draft),
        fact,
        ...stamp,
      },
    ]
  }
}

function foldAllMembers(view: SessionJournalView, batch: PublishedBatch): SessionJournalView {
  if (batch.pub <= view.head) return view
  const draft = draftOf(view.executions.get(batch.execution) ?? emptyExecutionView(batch.execution))
  // Write the operation index before the facts, so facts that name this batch's op can read it.
  const moves = advances(batch)
  const revision =
    batch.envelope.rev >= 1 ? batch.envelope.rev : moves ? draft.revision + 1 : draft.revision
  const recognition = batch.facts.find(fact => fact.kind === 'op.recognized')
  const target = recognition?.kind === 'op.recognized' ? recognition.target : null
  const answered = recognition?.kind === 'op.recognized' ? recognition.at.revision : revision
  const entry: OperationEntry = {
    execution: batch.execution,
    digest: batch.envelope.digest,
    pub: batch.pub,
    revision: answered,
    target,
    recalls: recognition?.kind === 'op.recognized' && recognition.recalls === true,
    kinds: batch.envelope.kinds,
  }
  const stamp: Stamp = {
    op: batch.envelope.op,
    digest: batch.envelope.digest,
    pub: batch.pub,
    revision,
  }
  if (!draft.ops.has(batch.envelope.op)) draft.ops.set(batch.envelope.op, entry)
  const exclusion = draft.excluded.get(batch.envelope.op)
  if (exclusion !== undefined && exclusion.revived !== true)
    draft.excluded.set(batch.envelope.op, { ...exclusion, revived: true })
  if (moves && !draft.reached.has(revision)) draft.reached.set(revision, stamp)
  draft.revision = revision
  draft.head = batch.pub
  for (const [index, fact] of batch.facts.entries()) apply(draft, fact, stamp, index + 1)
  const executions = forkOf(view.executions)
  executions.set(batch.execution, draft)
  return { head: batch.pub, executions }
}

// A fold of one batch together with the items it opened, changed or closed in its execution. The
// view it answers holds the open items only: what the batch closed has left it.
export function foldItems(
  view: SessionJournalView,
  batch: PublishedBatch,
): Readonly<{ view: SessionJournalView; changes: readonly ItemChange[] }> {
  const next = foldAllMembers(view, batch)
  const after = next.executions.get(batch.execution)
  if (next === view || after === undefined) return { view: next, changes: [] }
  const changed = itemChanges(view.executions.get(batch.execution), after)
  const changes = [...changed, ...closings(after, changed)]
  const open = evicted(after, changes)
  if (open === after) return { view: next, changes }
  return {
    view: { ...next, executions: forkOf(next.executions).set(batch.execution, open) },
    changes,
  }
}

export function fold(view: SessionJournalView, batch: PublishedBatch): SessionJournalView {
  return foldItems(view, batch).view
}

export function foldAll(
  batches: Iterable<PublishedBatch>,
  view: SessionJournalView = emptySessionView(),
): SessionJournalView {
  let current = view
  for (const batch of batches) current = fold(current, batch)
  return current
}
