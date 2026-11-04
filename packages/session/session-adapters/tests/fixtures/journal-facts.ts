// A generator of Agent fact logs for the Journal laws: a session with one or two executions, each
// opened, attached, advanced through producer rounds (intend, receive, judge, with the optional
// recognitions, controls, waits, passages, handoffs, crashes and recoveries), and ended through a
// candidate, its obligations and the terminal batch. Every batch is one operation, every fact key
// appears once, and the facts hold identities, evidence and references only.
import {
  decodeActionBatchId,
  decodeActionId,
  decodeAgentExecutionId,
  decodeAgentInstanceId,
  decodeAgentOperationId,
  decodeConsumptionId,
  decodeExecutionAttachmentId,
  decodeInputBatchId,
  decodeInputId,
  decodePassageId,
  decodeStepId,
  type ActionId,
  type AgentExecutionId,
  type AgentOperationId,
  type Authority,
  type DurableEvidence,
  type PendingCall,
  type StepId,
} from '@omne-harness/agent-contract'
import type { ModelInvocationRef } from '@omne-harness/model-contract'
import type { ToolInvocationRef } from '@omne-harness/tool-contract'
import {
  batchBytes,
  emptySessionView,
  fold,
  refOf,
  type Batch,
  type FactBody,
  type ParticipationKind,
  type PublishedBatch,
  type Ref,
} from '../../src/journal/index.ts'
import type { Random } from './property.ts'

function minted<T>(decoded: { ok: T } | { failure: unknown }, text: string): T {
  if ('failure' in decoded) throw new Error(`the fixture minted an invalid identity: ${text}`)
  return decoded.ok
}

export const evidence = (record: string, revision = 0): DurableEvidence => ({
  owner: 'laws',
  record,
  revision: String(revision),
  digest: `laws:${record}@${revision}`,
})

/** A reference to any fixture value: the laws never read the block, only its digest and size. */
const blob = (value: unknown): Ref<never> => refOf(value) as Ref<never>

const adoption = (name: string) => ({ owner: 'laws', name, revision: '1', digest: `laws:${name}` })

export type Scene = Readonly<{
  /** The batches in publication order, `pub` from 1. */
  log: readonly PublishedBatch[]
  executions: readonly AgentExecutionId[]
  /** The intend batches of each tool round, by execution, for the growth assertions. */
  rounds: ReadonlyMap<AgentExecutionId, readonly PublishedBatch[]>
  /** The candidate, obligations and ended batches of each execution that finished. */
  finishes: ReadonlyMap<
    AgentExecutionId,
    Readonly<{ candidate: PublishedBatch; obligations: PublishedBatch; ended: PublishedBatch }>
  >
}>

export type SceneOptions = Readonly<{
  executions?: 1 | 2
  /** The rounds of each execution; absent: random 1 to 6. */
  rounds?: number
  /** Whether each execution ends; absent: random. */
  finish?: boolean
  /** Whether to interleave the two executions' batches; absent: random. */
  interleave?: boolean
}>

type Builder = {
  execution: AgentExecutionId
  ops: number
  gen: number
  attachment: number
  step: number
  action: number
  consumption: number
  passage: number
  admissions: number
  events: number
  authority: Authority
  batches: Batch[]
  intends: Batch[]
  finish: { candidate: Batch; obligations: Batch; ended: Batch } | null
}

function authorityOf(builder: Builder): Authority {
  const text = `${builder.execution}/attachment/${builder.attachment}`
  return {
    execution: builder.execution,
    executionAttachment: minted(decodeExecutionAttachmentId(text), text),
    instance: minted(decodeAgentInstanceId(`instance-${builder.gen}`), 'instance'),
    generation: String(builder.gen),
    source: evidence(`${builder.execution}/grant/${builder.gen}`),
  }
}

function op(builder: Builder, what: string): AgentOperationId {
  builder.ops += 1
  const text = `${builder.execution}/op/${builder.ops}/${what}`
  return minted(decodeAgentOperationId(text), text)
}

function stepOf(builder: Builder): StepId {
  return minted(decodeStepId(`${builder.execution}/step/${builder.step}`), 'step')
}

function actionOf(builder: Builder, ordinal: number): ActionId {
  return minted(decodeActionId(`${builder.execution}/action/${ordinal}`), 'action')
}

function batch(
  builder: Builder,
  what: string,
  facts: readonly FactBody[],
  kinds: readonly ParticipationKind[] = [],
): Batch {
  const operation = op(builder, what)
  const value: Batch = {
    execution: builder.execution,
    envelope: {
      op: operation,
      digest: refOf({ what, facts }).digest,
      // The revision the batch reaches is set once the log is ordered (see `scene`).
      rev: 0,
      gen: String(builder.gen),
      kinds,
    },
    facts,
  }
  builder.batches.push(value)
  return value
}

function openBatches(builder: Builder, rng: Random): void {
  const input = minted(decodeInputId(`${builder.execution}/input/0`), 'input')
  const entry = op(builder, 'entry')
  const handoff = { kind: 'input' as const, execution: builder.execution, entry, input }
  batch(builder, 'open', [
    {
      kind: 'exec.opened',
      definition: adoption('definition'),
      schema: adoption('checkpoint'),
      instance: builder.authority.instance,
      scope: evidence(`${builder.execution}/scope`),
      original: { input, entry, handoff },
      coordination: rng.chance(1, 2) ? 'standalone' : 'coordinated',
    },
    {
      kind: 'exec.attached',
      authority: builder.authority,
      grant: evidence(`${builder.execution}/grant/1`),
      basis: { kind: 'open' },
    },
    {
      kind: 'input.accepted',
      input,
      entry,
      message: blob({ role: 'user', content: 'hello' }),
      source: evidence(`${builder.execution}/input/0/source`),
      priority: 'ordinary',
      watermark: evidence(`${builder.execution}/watermark/0`),
    },
    {
      kind: 'handoff.resolved',
      handoff,
      resolution: 'recorded',
      outcome: blob({ decision: 'prepared', message: { role: 'user', content: 'hello' } }),
      history: evidence(`${builder.execution}/history/0`),
    },
    {
      kind: 'cursor.moved',
      step: stepOf(builder),
      members: {
        position: 'I0',
        step: stepOf(builder),
        inputBatch: null,
        state: 'advancing',
        calls: blob([]),
        passages: blob([]),
      },
    },
  ])
}

function roundBatches(builder: Builder, rng: Random): void {
  builder.step += 1
  const step = stepOf(builder)
  builder.action += 1
  const modelAction = actionOf(builder, builder.action)
  builder.consumption += 1
  const modelConsumption = minted(
    decodeConsumptionId(`${builder.execution}/consumption/${builder.consumption}`),
    'consumption',
  )
  const reference = `model:${builder.execution}:${builder.step}` as ModelInvocationRef
  const pending: PendingCall = {
    kind: 'model',
    action: modelAction,
    consumption: modelConsumption,
    position: { owner: 'agent', work: builder.execution, position: step, purpose: 'main' },
    fixed: evidence(`${builder.execution}/fixed/${builder.step}`),
    reference,
    purpose: 'main',
  }
  const intend = batch(builder, 'intend', [
    {
      kind: 'step.begun',
      step,
      batch: {
        id: minted(decodeInputBatchId(`${builder.execution}/batch/${builder.step}`), 'batch'),
        watermark: evidence(`${builder.execution}/watermark/${builder.step}`),
        ordered: [],
      },
    },
    {
      kind: 'request.adopted',
      step,
      attempt: 0,
      reference,
      fixed: pending.fixed,
      schema: adoption('request-record'),
      record: blob({ large: 'x'.repeat(4000) }),
      coverage: evidence(`${builder.execution}/coverage/${builder.step}`),
    },
    {
      kind: 'call.intended',
      action: modelAction,
      step,
      pending,
      authority: builder.authority,
      request: null,
    },
    {
      kind: 'cursor.moved',
      step,
      members: { position: 'M0', step, calls: blob([pending]) },
    },
  ])
  builder.intends.push(intend)
  if (rng.chance(1, 4))
    batch(builder, 'voided-retry', [
      {
        kind: 'intent.voided',
        step,
        attempt: 0,
        basis: evidence(`${builder.execution}/not-accepted/${builder.step}`),
      },
      {
        kind: 'request.adopted',
        step,
        attempt: 1,
        reference: `${reference}:1` as ModelInvocationRef,
        fixed: pending.fixed,
        schema: adoption('request-record'),
        record: blob({ large: 'y'.repeat(4000) }),
        coverage: null,
      },
    ])
  if (rng.chance(1, 3))
    batch(builder, 'recognize', [{ kind: 'op.recognized', target: intend.envelope.op }])
  batch(builder, 'receive', [
    {
      kind: 'result.received',
      consumption: modelConsumption,
      delivery: `delivery/${builder.step}`,
      result: {
        producer: 'model',
        call: `call-${builder.step}`,
        version: '1',
        delivery: `delivery/${builder.step}`,
        source: evidence(`${builder.execution}/result/${builder.step}`),
      },
      consumer: pending.position,
      custody: blob({ role: 'assistant', content: 'z'.repeat(rng.int(20_000)) }),
      saved: evidence(`${builder.execution}/saved/${builder.step}`),
    },
  ])
  builder.admissions += 1
  const judge: FactBody[] = [
    {
      kind: 'reply.judged',
      sequence: builder.admissions,
      fact: {
        step,
        action: modelAction,
        call: `call-${builder.step}` as never,
        resultVersion: '1',
        decision: rng.chance(5, 6) ? 'admitted' : 'rejected',
        source: evidence(`${builder.execution}/admission/${builder.step}`),
      },
      basis: evidence(`${builder.execution}/prefix/${builder.admissions}`),
      publication: evidence(`${builder.execution}/publication/${builder.admissions}`),
      message: blob({ role: 'assistant', content: 'reply' }),
      history: evidence(`${builder.execution}/history/${builder.step}`),
    },
    {
      kind: 'result.handled',
      consumption: modelConsumption,
      result: {
        producer: 'model',
        call: `call-${builder.step}`,
        version: '1',
        delivery: `delivery/${builder.step}`,
        source: evidence(`${builder.execution}/result/${builder.step}`),
      },
      stage: 'processed',
      evidence: evidence(`${builder.execution}/processed/${builder.step}`),
    },
  ]
  const tool = rng.chance(2, 3)
  if (tool) {
    builder.action += 1
    const toolAction = actionOf(builder, builder.action)
    const batchId = minted(
      decodeActionBatchId(`${builder.execution}/batch/${builder.step}`),
      'action batch',
    )
    judge.push(
      {
        kind: 'batch.fixed',
        batch: batchId,
        step,
        source: {
          producer: 'model',
          call: `call-${builder.step}`,
          version: '1',
          delivery: null,
          source: evidence(`${builder.execution}/result/${builder.step}`),
        },
        actions: [
          { action: toolAction, callId: `call_${builder.step}`, arguments: blob({ a: 1 }) },
        ],
      },
      {
        kind: 'action.judged',
        action: toolAction,
        judgment: 'allowed',
        evidence: evidence(`${builder.execution}/judged/${builder.step}`),
        passage: null,
        request: blob({ tool: 'read', arguments: { path: 'x' } }),
      },
    )
  }
  judge.push({ kind: 'cursor.moved', step, members: { position: tool ? 'A2' : 'Ja' } })
  batch(builder, 'judge', judge, ['message'])
  if (tool) {
    const toolAction = actionOf(builder, builder.action)
    builder.consumption += 1
    const toolConsumption = minted(
      decodeConsumptionId(`${builder.execution}/consumption/${builder.consumption}`),
      'consumption',
    )
    const toolPending: PendingCall = {
      kind: 'tool',
      purpose: 'action',
      association: 'intent',
      action: toolAction,
      consumption: toolConsumption,
      position: { owner: 'agent', work: builder.execution, position: step, purpose: 'action' },
      fixed: evidence(`${builder.execution}/tool-fixed/${builder.step}`),
    }
    batch(builder, 'tool-intend', [
      {
        kind: 'call.intended',
        action: toolAction,
        step,
        pending: toolPending,
        authority: builder.authority,
        request: blob({ tool: 'read', arguments: { path: 'x' } }),
      },
      { kind: 'cursor.moved', step, members: { position: 'X2', calls: blob([toolPending]) } },
    ])
    batch(builder, 'tool-associated', [
      {
        kind: 'call.associated',
        action: toolAction,
        reference: `tool:${builder.execution}:${builder.step}` as ToolInvocationRef,
        receipt: evidence(`${builder.execution}/tool-receipt/${builder.step}`),
      },
    ])
    if (rng.chance(1, 4)) {
      const control = op(builder, 'control')
      batch(builder, 'control', [
        {
          kind: 'control.stage',
          control,
          command: {
            kind: 'interrupt-tool',
            call: `tool-call-${builder.step}` as never,
            reason: evidence(`${builder.execution}/interrupt/${builder.step}`),
          },
          toolInvocation: `tool:${builder.execution}:${builder.step}` as ToolInvocationRef,
          toolOperation: null,
          stage: 'accepted',
          state: 'reached',
          source: evidence(`${builder.execution}/control/${builder.step}`),
        },
      ])
      batch(builder, 'record-control', [
        {
          kind: 'control.stage',
          control,
          command: {
            kind: 'interrupt-tool',
            call: `tool-call-${builder.step}` as never,
            reason: evidence(`${builder.execution}/interrupt/${builder.step}`),
          },
          toolInvocation: `tool:${builder.execution}:${builder.step}` as ToolInvocationRef,
          toolOperation: null,
          stage: 'producer-confirmed',
          state: rng.chance(1, 2) ? 'reached' : 'unresolved',
          source: evidence(`${builder.execution}/confirmed/${builder.step}`),
        },
      ])
    }
    if (rng.chance(1, 3))
      batch(builder, 'wait', [
        {
          kind: 'wait.entered',
          step,
          waits: [{ kind: 'producer', pending: { ...toolPending } }],
        },
        { kind: 'cursor.moved', step, members: { state: 'waiting', position: 'W0' } },
      ])
    batch(builder, 'tool-receive', [
      {
        kind: 'result.received',
        consumption: toolConsumption,
        delivery: `tool-delivery/${builder.step}`,
        result: {
          producer: 'tool',
          call: `tool-call-${builder.step}`,
          version: '1',
          delivery: `tool-delivery/${builder.step}`,
          source: evidence(`${builder.execution}/tool-result/${builder.step}`),
        },
        consumer: toolPending.position,
        custody: blob({ role: 'tool', content: 'w'.repeat(rng.int(50_000)) }),
        saved: evidence(`${builder.execution}/tool-saved/${builder.step}`),
      },
    ])
    batch(
      builder,
      'tool-consumed',
      [
        {
          kind: 'result.handled',
          consumption: toolConsumption,
          result: {
            producer: 'tool',
            call: `tool-call-${builder.step}`,
            version: '1',
            delivery: `tool-delivery/${builder.step}`,
            source: evidence(`${builder.execution}/tool-result/${builder.step}`),
          },
          stage: 'processed',
          evidence: evidence(`${builder.execution}/tool-processed/${builder.step}`),
        },
        {
          kind: 'slot.settled',
          action: toolAction,
          settlement: evidence(`${builder.execution}/slot/${builder.step}`),
        },
        { kind: 'cursor.moved', step, members: { position: 'T5', state: 'advancing' } },
      ],
      ['processed'],
    )
  }
  if (rng.chance(1, 5)) {
    builder.passage += 1
    const passage = minted(
      decodePassageId(`${builder.execution}/passage/${builder.passage}`),
      'passage',
    )
    batch(builder, 'passage', [
      {
        kind: 'passage.declared',
        passage,
        subject: blob({ subject: 'extension' }),
        declared: evidence(`${builder.execution}/passage/${builder.passage}`),
      },
      { kind: 'passage.progressed', passage, progress: blob({ round: 1 }), round: '1' },
      {
        kind: 'passage.concluded',
        passage,
        conclusion: blob({ conclusion: 'done' }),
        evidence: evidence(`${builder.execution}/concluded/${builder.passage}`),
      },
    ])
  }
  if (rng.chance(1, 6)) {
    batch(builder, 'ack', [{ kind: 'ack.through', sequence: builder.step }])
  }
  if (rng.chance(1, 6)) {
    // A crash: the successor attaches with the next generation.
    builder.gen += 1
    builder.attachment += 1
    builder.authority = authorityOf(builder)
    batch(builder, 'recover', [
      {
        kind: 'exec.attached',
        authority: builder.authority,
        grant: evidence(`${builder.execution}/grant/${builder.gen}`),
        basis: {
          kind: 'recovery',
          recovery: evidence(`${builder.execution}/recovery/${builder.gen}`),
          takeover: null,
        },
      },
    ])
  }
}

function finishBatches(builder: Builder, rng: Random): void {
  const step = stepOf(builder)
  const candidate = op(builder, 'candidate')
  const candidateBatch = batch(builder, 'candidate', [
    {
      kind: 'finish.candidate',
      candidate,
      claim: {
        origin: evidence(`${builder.execution}/origin`),
        conclusion: { kind: 'complete' },
        failure: null,
        inputWatermark: evidence(`${builder.execution}/watermark/${builder.step}`),
        conditions: evidence(`${builder.execution}/conditions`),
      },
      checkpoint: blob({ position: 'F1', step }),
      route: evidence(`${builder.execution}/route/${candidate}`),
      supersedes: null,
    },
    { kind: 'cursor.moved', step, members: { state: 'settling', position: 'F1' } },
  ])
  // Each open tool call left about two obligations; each is one small fact with a reference.
  const items: FactBody[] = []
  const count = builder.action * 2
  for (let index = 0; index < count; index += 1)
    items.push({
      kind: 'finish.obligation',
      candidate,
      index,
      category: rng.pick(['result', 'control', 'handoff']),
      item: blob({ obligation: index, detail: 'd'.repeat(6000) }),
    })
  items.push({
    kind: 'finish.obligations',
    candidate,
    count,
    evidence: evidence(`${builder.execution}/obligations/${candidate}`),
  })
  const obligations = batch(builder, 'obligations', items)
  const ended = batch(builder, 'ended', [
    {
      kind: 'finish.ended',
      candidate,
      conclusion: { kind: 'complete' },
      disposition: evidence(`${builder.execution}/disposition`),
    },
  ])
  builder.finish = { candidate: candidateBatch, obligations, ended }
}

/** Generates a scene: the batches of one or two executions, interleaved or not, with `pub` set. */
export function scene(rng: Random, options: SceneOptions = {}): Scene {
  const count = options.executions ?? (rng.chance(1, 2) ? 1 : 2)
  const builders: Builder[] = []
  for (let index = 1; index <= count; index += 1) {
    const execution = minted(decodeAgentExecutionId(`exec-${index}`), 'execution')
    const builder: Builder = {
      execution,
      ops: 0,
      gen: 1,
      attachment: 1,
      step: 0,
      action: 0,
      consumption: 0,
      passage: 0,
      admissions: 0,
      events: 0,
      authority: null as never,
      batches: [],
      intends: [],
      finish: null,
    }
    builder.authority = authorityOf(builder)
    openBatches(builder, rng)
    const rounds = options.rounds ?? 1 + rng.int(6)
    for (let round = 0; round < rounds; round += 1) roundBatches(builder, rng)
    if (options.finish ?? rng.chance(1, 2)) finishBatches(builder, rng)
    builders.push(builder)
  }
  const interleave = options.interleave ?? rng.chance(1, 2)
  const ordered: Batch[] = []
  if (interleave && builders.length > 1) {
    const cursors = builders.map(() => 0)
    while (cursors.some((at, index) => at < builders[index]!.batches.length)) {
      const open = cursors
        .map((at, index) => (at < builders[index]!.batches.length ? index : -1))
        .filter(index => index >= 0)
      const index = rng.pick(open)
      const at = cursors[index]!
      ordered.push(builders[index]!.batches[at]!)
      cursors[index] = at + 1
    }
  } else for (const builder of builders) ordered.push(...builder.batches)
  // The envelope names the revision the batch reaches: fold the ordered log once to learn it.
  const log: PublishedBatch[] = []
  let view = emptySessionView()
  for (const [index, value] of ordered.entries()) {
    const draft = { ...value, pub: index + 1 }
    view = fold(view, draft)
    const target = value.facts.find(fact => fact.kind === 'op.recognized')
    const rev =
      target?.kind === 'op.recognized'
        ? view.ops.get(target.target)!.revision
        : view.executions.get(value.execution)!.revision
    log.push({ ...draft, envelope: { ...draft.envelope, rev } })
  }
  const byOp = new Map(log.map(item => [item.envelope.op, item]))
  const published = (value: Batch): PublishedBatch => byOp.get(value.envelope.op)!
  return {
    log,
    executions: builders.map(builder => builder.execution),
    rounds: new Map(builders.map(builder => [builder.execution, builder.intends.map(published)])),
    finishes: new Map(
      builders
        .filter(builder => builder.finish !== null)
        .map(builder => [
          builder.execution,
          {
            candidate: published(builder.finish!.candidate),
            obligations: published(builder.finish!.obligations),
            ended: published(builder.finish!.ended),
          },
        ]),
    ),
  }
}

export const bytesOfBatches = (batches: readonly Batch[]): number =>
  batches.reduce((sum, item) => sum + batchBytes(item), 0)
