import { SharedMap, isTable } from '../journal/shared-map.ts'
import type {
  AcceptedInput,
  Adoption,
  AgentEvent,
  AgentEventBody,
  AgentOperationId,
  CommandReceipt,
  ControlRecord,
  DurableEvidence,
  ExecutionState,
  HandoffOutcome,
  HandoffReference,
  HandoffResolution,
  PendingCall,
  ResultResponsibility,
  TerminalObservation,
} from '@omne-harness/agent-contract'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { canonical } from './canonical.ts'
import { needClosed, type ClosedTable } from './closed-items.ts'
import {
  checkpointOf,
  handoffKey,
  receivedViews,
  type ProducerCall,
  type BlobStore,
  type AdmissionView,
  type ExecutionView,
  type Mint,
  type HandoffView,
  type Stamp,
  type ResultView,
  type SessionJournalView,
} from '../journal/index.ts'
import type { HandoffRecord, MemoryExecution, OperationRecord } from './journal.ts'
import type { AdmissionLedger, AdmissionProjection, AdmissionRecord } from './reply-admissions.ts'
import { finishingOf } from './journal-finishing.ts'
import { emptyReceivingState, type ReceivingState } from './journal-receiving.ts'
import { bindTarget } from './binding-targets.ts'
import { journalEvidence, operationText, revisionOf, semanticKey } from './journal-values.ts'
import { captureHuman } from './human.ts'
import { receivedRecord, stampReceipt } from './received-records.ts'
import type { CommonRoot } from './root.ts'

export const EXECUTION_FIELDS = [
  'id',
  'tenant',
  'revision',
  'state',
  'checkpoint',
  'attachments',
  'inputs',
  'inputRevisions',
  'events',
  'retainedFrom',
  'acknowledged',
  'acknowledgedAt',
  'controls',
  'results',
  'resultRevisions',
  'effects',
  'observations',
  'stageReceipts',
  'observed',
  'admissions',
  'admissionLedger',
  'entries',
  'handoffs',
  'custodyAttempts',
  'finishing',
  'serial',
] as const satisfies readonly (keyof MemoryExecution)[]

export type ExecutionField = (typeof EXECUTION_FIELDS)[number]

export type ProjectionContext = Readonly<{
  tenant: TenantId
  blobs: BlobStore
  mint: Mint
  eventSchema: Adoption
  admissionRule: Adoption
}>

type CustodyAttempt = MemoryExecution['custodyAttempts'] extends Map<unknown, infer V> ? V : never

function pubOf(evidence: DurableEvidence): number | null {
  const found = /\/pub\/(\d+)$/u.exec(evidence.record)
  return found === null ? null : Number(found[1])
}

function producedOf(result: ProducerCall): ResultResponsibility['result'] {
  return {
    producer:
      result.producer === 'compaction'
        ? { kind: 'compaction', task: result.task }
        : ({ kind: result.producer, call: result.call } as never),
    version: result.version,
    delivery: result.delivery,
    source: result.source,
  }
}

function bodyOf(
  fact: ExecutionView['events'][number]['fact'],
  blobs: BlobStore,
): AgentEventBody | null {
  switch (fact.kind) {
    case 'step.begun':
      return { kind: 'input-taken', batch: fact.batch }
    case 'result.received':
      return { kind: 'entry', entry: blob(blobs, fact.custody) }
    case 'fence.started':
      return {
        kind: 'entry',
        entry: {
          kind: 'start-fence',
          operation: fact.operation as never,
          guard: fact.guard,
          fence: fact.fence,
        },
      }
    case 'result.handled':
      return { kind: 'producer', result: producedOf(fact.result), consumption: fact.consumption }
    case 'reply.judged':
      return fact.message === null || fact.source === null
        ? null
        : { kind: 'message', message: blob(blobs, fact.message), source: fact.source }
    case 'message.published':
      return { kind: 'message', message: blob(blobs, fact.message), source: fact.source }
    case 'control.stage':
      return {
        kind: 'control',
        operation: fact.control,
        stage: fact.stage,
        state: fact.state,
        source: fact.source,
      }
    case 'wait.entered':
      return { kind: 'waiting', waits: blob(blobs, fact.waits) }
    case 'finish.ended':
      return { kind: 'ended', conclusion: fact.conclusion, disposition: fact.disposition }
    default:
      return null
  }
}

function blob<T>(blobs: BlobStore, ref: unknown): T {
  if (Array.isArray(ref) && ref.length === 2 && typeof ref[0] === 'string') {
    const kept = blobs.get(ref[0])
    return (kept === undefined ? ref[1] : kept) as T
  }
  const digest = (ref as { digest?: unknown } | null)?.digest
  const value = typeof digest === 'string' ? blobs.get(digest) : undefined
  if (value === undefined)
    throw new TypeError(`the projection has no content block ${String(digest)}`)
  return value as T
}

function stateOf(view: ExecutionView, blobs: BlobStore): MemoryExecution['state'] {
  const ended = view.finish.ended
  if (ended !== null)
    return { kind: 'ended', conclusion: ended.conclusion, disposition: ended.disposition }
  const last = view.attachments.at(-1)
  if (last?.status === 'detached' && last.handoff !== null)
    return { kind: 'suspended', handoff: last.handoff }
  const candidate = view.finish.candidates.find(item => item.candidate === view.finish.current)
  const settled = candidate === undefined ? 0 : candidate.pub
  const moved = view.cursorMoved.state ?? 0
  const attached = last !== undefined && view.attachments.length > 1 ? last.pub : 0
  const latest = Math.max(settled, moved, attached)
  if (latest === 0) return { kind: 'advancing' }
  if (latest === attached) return { kind: 'reconciling' }
  if (latest === settled && settled > moved) return { kind: 'settling' }
  switch (view.cursor.state) {
    case 'waiting':
      return view.waits === null
        ? { kind: 'advancing' }
        : { kind: 'waiting', waits: blob(blobs, view.waits.waits) }
    case 'settling':
      return { kind: 'settling' }
    case 'reconciling':
      return { kind: 'reconciling' }
    case 'suspended':
      return last?.handoff === null || last === undefined
        ? { kind: 'advancing' }
        : { kind: 'suspended', handoff: last.handoff }
    default:
      return { kind: 'advancing' }
  }
}

// A prepared H whose resolution carries no history was rejected: nothing entered the history.
function historyOf(item: HandoffView, ended: DurableEvidence | null): HandoffRecord['history'] {
  if (item.retired !== null) return { kind: 'not-applicable' }
  if (item.resolved === null)
    return ended === null ? { kind: 'pending' } : { kind: 'retained', disposition: ended }
  if (item.prepared !== null && item.resolved.history === null) return { kind: 'not-applicable' }
  return {
    kind: 'committed',
    operation: item.resolved.op,
    revision: revisionOf(item.resolved.revision),
  }
}

// A result is a responsibility of the execution once recordResult took it; a producer event that
// processed a result without that record is a fact of the step, not a responsibility.
const responsible = (item: ResultView): boolean => item.stages.recorded !== undefined

export function attachmentsOf(
  view: Pick<ExecutionView, 'attachments'>,
): MemoryExecution['attachments'] {
  return view.attachments.map(item => ({
    authority: item.authority,
    grant: item.grant,
    status: item.status,
    handoff: item.handoff,
    handoffRevision: item.handoffRevision,
  }))
}

// The blocks a handoff's parts live in: what a reader of one handoff must have fetched.
export function handoffRefs(item: HandoffView): unknown[] {
  return [item.prepared?.request, item.resolved?.outcome, item.retired?.excluded].filter(
    ref => ref !== undefined,
  )
}

export function handoffParts(item: HandoffView, blobs: BlobStore) {
  const outcome = item.resolved === null ? null : blob<HandoffOutcome>(blobs, item.resolved.outcome)
  const excluded =
    item.retired === null
      ? null
      : blob<Extract<HandoffResolution, { kind: 'excluded' }>>(blobs, item.retired.excluded)
  const request =
    item.prepared !== null
      ? blob<HandoffRecord['request']>(blobs, item.prepared.request)
      : (outcome?.request ?? excluded?.request)
  return { outcome, excluded, request }
}

export function handoffRecordOf(
  item: HandoffView,
  blobs: BlobStore,
  ended: DurableEvidence | null,
): HandoffRecord | undefined {
  const { outcome, excluded, request } = handoffParts(item, blobs)
  if (request === undefined) return undefined
  return {
    handoff: item.handoff,
    request,
    prepared: item.prepared?.prepared ?? null,
    resolution: outcome !== null ? { kind: 'recorded', outcome } : excluded,
    history: historyOf(item, ended),
    retirement:
      item.retired === null
        ? null
        : {
            operation: item.retired.op,
            revision: revisionOf(item.retired.revision),
            reason: item.retired.reason,
          },
  }
}

// A handoff the core no longer holds open, read back by its reference.
export function closedHandoffRecord(
  table: ClosedTable & Readonly<{ blobs: BlobStore }>,
  execution: Pick<MemoryExecution, 'id' | 'state'>,
  reference: HandoffReference,
): HandoffRecord | undefined {
  const ref = { execution: execution.id, family: 'handoff', item: handoffKey(reference) }
  const body = needClosed(table, ref) as HandoffView | null
  const ended = execution.state.kind === 'ended' ? execution.state.disposition : null
  return body === null ? undefined : handoffRecordOf(body, table.blobs, ended)
}

export function projectExecution(
  view: ExecutionView,
  context: ProjectionContext,
): Partial<MemoryExecution> {
  const receipt = (stamp: Stamp) => stampReceipt(context.mint, view.execution, stamp)
  const projected: Partial<MemoryExecution> = {
    id: view.execution,
    tenant: context.tenant,
    revision: view.revision,
    state: stateOf(view, context.blobs) as MemoryExecution['state'],
    attachments: attachmentsOf(view),
    inputs: view.inputs.map((item): AcceptedInput => ({
      id: item.input,
      content: blob(context.blobs, item.message),
      source: item.source,
      priority: item.priority,
    })),
    inputRevisions: new Map(view.inputs.map(item => [item.input, item.revision])),
    retainedFrom: 1,
    acknowledged: view.acknowledged,
    acknowledgedAt: view.acknowledgedAt,
    controls: [...view.controls.values()].map(
      item =>
        ({
          operation: item.control,
          command: item.command,
          ...(item.modelInvocation === null ? {} : { modelInvocation: item.modelInvocation }),
          ...(item.toolInvocation === null ? {} : { toolInvocation: item.toolInvocation }),
          ...(item.toolOperation === null ? {} : { toolOperation: item.toolOperation }),
          stages: Object.fromEntries(
            Object.entries(item.stages).map(([stage, fact]) => [
              stage,
              { state: fact.state, source: fact.source },
            ]),
          ),
        }) as unknown as ControlRecord,
    ),
    results: [...view.results.values()].filter(responsible).map((item): ResultResponsibility => ({
      result: producedOf(item.result),
      consumption: item.consumption,
      custody: item.stages.custody ?? null,
      completion: item.stages.processed ?? null,
      release:
        item.stages.released === undefined
          ? { kind: 'pending' }
          : { kind: 'confirmed', receipt: item.stages.released },
    })),
    effects: [...view.intents.values()].map(item => ({
      action: item.action,
      pending: item.pending,
      authority: item.authority,
    })),
    observations: view.observations.map((item): TerminalObservation => ({
      terminal: item.terminal,
      passage: item.passage,
      implementation: item.implementation,
      observed: item.observed,
    })),
    observed: new Map(view.observations.map(item => [item.passage, receipt(item)])),
    stageReceipts: new Map(
      [...view.controls.values()].flatMap(control =>
        Object.entries(control.stages).flatMap(([stage, fact]) => {
          // The accepted stage is recognized by its control operation, not by a stage receipt.
          if (stage === 'accepted' || fact === undefined) return []
          return [
            [JSON.stringify([control.control, stage]), receipt(fact)] as [string, CommandReceipt],
          ]
        }),
      ),
    ),
    admissions: admissionRecords(view),
    entries: view.events.flatMap(event => {
      if (event.fact.kind === 'result.received')
        return [blob<MemoryExecution['entries'][number]>(context.blobs, event.fact.custody)]
      if (event.fact.kind === 'fence.started')
        return [
          {
            kind: 'start-fence' as const,
            operation: event.fact.operation as never,
            guard: event.fact.guard,
            fence: event.fact.fence,
          },
        ]
      return []
    }),
  }
  try {
    projected.checkpoint = checkpointOf(view, context.blobs)
  } catch (error) {
    if (
      !(error instanceof TypeError && error.message.startsWith('the folded cursor has no member'))
    )
      throw error
  }
  const ended = view.finish.ended
  if (ended !== null && projected.checkpoint !== undefined) {
    const recorded = new Map(view.observations.map(item => [item.passage, item]))
    projected.observations = projected.checkpoint.passages
      .filter(passage => passage.position === 'after_terminal')
      .map(passage => ({
        terminal: ended.disposition,
        passage: passage.id,
        implementation: passage.implementation,
        observed: recorded.get(passage.id)?.observed ?? null,
      }))
  }
  projected.events = view.events.flatMap((event): AgentEvent[] => {
    const body = bodyOf(event.fact, context.blobs)
    const found = receipt(event)
    if (body === null) return []
    return [
      {
        execution: view.execution,
        sequence: String(event.eseq),
        executionAttachment: (event.attachment?.executionAttachment ?? '') as never,
        schema: context.eventSchema,
        cause: event.fact.kind === 'finish.ended' ? event.fact.disposition : found.evidence,
        body,
      },
    ]
  })
  projected.finishing = finishingOf(view, context.blobs, {
    receipt: stamp => ({ ...receipt(stamp), state: 'applied' }),
    checkpoint: (candidate, revision) =>
      journalEvidence(
        `${context.mint.session}/${view.execution}/candidate/${candidate}/checkpoint`,
        revision,
      ),
  })
  projected.resultRevisions = new Map(
    [...view.results.values()].filter(responsible).flatMap(item => {
      const latest = Object.values(item.stages)
        .flatMap(stage => (stage === undefined || pubOf(stage) === null ? [] : [stage]))
        .sort((left, right) => pubOf(left)! - pubOf(right)!)
        .at(-1)
      if (latest === undefined) return []
      const revision = Number(latest.revision)
      const key = semanticKey('responsibility', [
        producedOf(item.result).producer,
        item.result.version,
        item.consumption,
      ])
      return [[key, revision] as [string, number]]
    }),
  )
  const parts = [...(JSON.parse(context.mint.session) as string[]), view.execution]
  const originRevision = view.opened === null ? 1 : view.opened.revision
  const origin = journalEvidence(
    `${JSON.stringify(parts)}/reply-admission-prefix/0`,
    originRevision,
  )
  const { admitted } = view
  const projection: AdmissionProjection = {
    rule: context.admissionRule,
    ...admitted,
    basis: admitted.basis ?? origin,
  }
  const ledger: AdmissionLedger = { origin, retainedFrom: 1, rangesFrom: 0, projection }
  projected.admissionLedger = ledger
  projected.handoffs = [...view.handoffs.values()].flatMap(item => {
    const record = handoffRecordOf(item, context.blobs, ended?.disposition ?? null)
    return record === undefined ? [] : [record]
  })
  projected.custodyAttempts = new Map(
    [...view.handoffs.values()].flatMap(item =>
      item.recorded.map((attempt): [AgentOperationId, CustodyAttempt] => [
        attempt.op,
        {
          handoff: item.handoff,
          original: blob(context.blobs, attempt.outcome),
          custody: attempt.custody === null ? null : blob(context.blobs, attempt.custody),
        },
      ]),
    ),
  )
  projected.serial = view.opened === null ? 0 : view.opened.pub
  return projected
}

// The open operations of the execution are its exclusions; what one answered is a closed item.
export function projectOperations(
  view: ExecutionView,
  context: ProjectionContext,
): Map<string, OperationRecord> {
  const out = new Map<string, OperationRecord>()
  const text = tenantCodec.encode(context.tenant)
  const tenantText = text.ok ? text.value : ''
  for (const [op, entry] of view.excluded)
    out.set(operationText(tenantText, view.execution, op), {
      kind: 'excluded',
      key: '',
      execution: view.execution,
      operation: op,
      reason: entry.reason,
      evidence: entry.evidence,
    })
  return out
}

export type FieldsDiff = Readonly<{
  equal: ExecutionField[]
  differ: ExecutionField[]
  missing: ExecutionField[]
}>

const text = (value: unknown): string =>
  canonical(isTable(value) ? [...value.entries()].sort() : value)

export function fieldsDiff(
  expected: MemoryExecution,
  actual: Partial<MemoryExecution>,
): FieldsDiff {
  const equal: ExecutionField[] = []
  const differ: ExecutionField[] = []
  const missing: ExecutionField[] = []
  for (const field of EXECUTION_FIELDS) {
    if (!(field in actual)) {
      missing.push(field)
      continue
    }
    ;(text(expected[field]) === text(actual[field]) ? equal : differ).push(field)
  }
  return { equal, differ, missing }
}

export function fieldTexts(
  expected: MemoryExecution,
  actual: Partial<MemoryExecution>,
  field: ExecutionField,
): Readonly<{ expected: string; actual: string }> {
  return { expected: text(expected[field]), actual: text(actual[field]) }
}

export type { ExecutionState }

export type EventFragments = Pick<
  CommonRoot['agent'],
  'eventReceipts' | 'pendingEvents' | 'callOrigins' | 'human' | 'indexedEvents'
>

export const emptyFragments = (): EventFragments => ({
  eventReceipts: new SharedMap(),
  pendingEvents: new SharedMap(),
  callOrigins: new SharedMap(),
  human: new SharedMap(),
  indexedEvents: new SharedMap(),
})

function pendingsOf(
  origins: EventFragments['callOrigins'],
  execution: MemoryExecution,
  event: AgentEvent,
): PendingCall[] {
  if (event.body.kind === 'waiting')
    return event.body.waits.flatMap(wait => (wait.kind === 'producer' ? [wait.pending] : []))
  if (event.body.kind === 'producer') {
    const origin = origins.get(`${execution.id}\0${event.body.consumption}`)
    const pending = origin?.association?.pending ?? origin?.pending
    return pending === undefined ? [] : [pending]
  }
  return []
}

function originOf(
  origins: EventFragments['callOrigins'],
  execution: MemoryExecution,
  event: AgentEvent,
  value: PendingCall,
): void {
  const key = `${execution.id}\0${value.consumption}`
  const prior = origins.get(key)
  if (prior === undefined) {
    origins.set(key, { first: event.sequence, pending: value, association: null })
    return
  }
  if (
    prior.pending.kind === 'tool' &&
    prior.pending.association === 'intent' &&
    value.kind === 'tool' &&
    value.association === 'associated' &&
    prior.association === null
  )
    origins.set(key, {
      ...prior,
      association: { sequence: event.sequence, pending: value, source: event.cause },
    })
}

export function admissionRecords(view: ExecutionView): (AdmissionRecord | undefined)[] {
  const records: (AdmissionRecord | undefined)[] = Array.from({ length: view.admitted.sequence })
  for (const item of view.admissions) records[item.sequence - 1] = admissionRecord(item)
  return records
}

export const admissionRecord = (item: AdmissionView): AdmissionRecord => ({
  fact: item.fact,
  publication: item.publication,
  basis: item.basis,
  present: true,
})

export function projectFragments(
  execution: MemoryExecution,
  view: ExecutionView,
  context: ProjectionContext,
): EventFragments {
  const out = emptyFragments()
  const stampOf = new Map(view.events.map(event => [String(event.eseq), event]))
  out.indexedEvents.set(execution.id, execution.events.length)
  for (const event of execution.events) {
    const key = `${execution.id}\0${event.sequence}`
    const stamp = stampOf.get(event.sequence)
    if (stamp === undefined) continue
    const receipt = stampReceipt(context.mint, execution.id, stamp)
    out.eventReceipts.set(key, receipt)
    const pending = pendingsOf(out.callOrigins, execution, event)
    out.pendingEvents.set(key, pending)
    for (const value of pending) originOf(out.callOrigins, execution, event, value)
    if (event.body.kind === 'waiting' && event.body.waits.some(wait => wait.kind === 'human')) {
      try {
        out.human.set(key, captureHuman(event, execution.checkpoint, receipt))
      } catch {}
    }
  }
  return out
}

export type ProjectedExecution = Readonly<{ view: ExecutionView; execution: MemoryExecution }>

export function projectReceiving(
  executions: readonly ProjectedExecution[],
  context: ProjectionContext,
): ReceivingState {
  const state = emptyReceivingState()
  const text = tenantCodec.encode(context.tenant)
  const tenantText = text.ok ? text.value : ''
  type Item = Readonly<{ pub: number; ord: number; apply(): void }>
  const items: Item[] = []
  for (const { view, execution } of executions) {
    const keyOf = (op: AgentOperationId) => operationText(tenantText, execution.id, op)
    for (const binding of view.bindings)
      items.push({
        pub: binding.pub,
        ord: 2,
        apply: () =>
          bindTarget(
            state,
            execution,
            binding.instance,
            binding.definition,
            blob(context.blobs, binding.pending),
          ),
      })
    const scope = { tenantText, execution: execution.id, mint: context.mint, blobs: context.blobs }
    for (const received of receivedViews(view)) {
      const { delivery, kept, material } = receivedRecord(scope, received)
      items.push({
        pub: received.pub,
        ord: 1,
        apply: () => {
          state.deliveries.set(delivery, kept)
          state.aliases.set(keyOf(received.op), kept)
          if (material !== null) state.materials.set(canonical(kept.entry.material), material)
        },
      })
    }
    for (const material of view.materials.values())
      items.push({
        pub: material.pub,
        ord: 1,
        apply: () => {
          const key = canonical(material.source)
          if (state.materials.has(key)) return
          state.materials.set(key, {
            tenant: tenantText,
            execution: material.qualifier,
            value: blob(context.blobs, material.value),
          })
        },
      })
  }
  items.sort((left, right) => left.pub - right.pub || left.ord - right.ord)
  for (const item of items) item.apply()
  return state
}

export type ProjectedRecords = Readonly<{
  executions: ReadonlyMap<string, MemoryExecution>
  operations: ReadonlyMap<string, OperationRecord>
  fragments: EventFragments
  receiving: ReceivingState
}>

const FRAGMENT_NAMES = [
  'eventReceipts',
  'pendingEvents',
  'callOrigins',
  'human',
  'indexedEvents',
] as const

export function projectRecords(
  view: SessionJournalView,
  context: ProjectionContext,
): ProjectedRecords {
  const text = tenantCodec.encode(context.tenant)
  const tenantText = text.ok ? text.value : ''
  const executions = new Map<string, MemoryExecution>()
  const operations = new Map<string, OperationRecord>()
  const fragments = emptyFragments()
  const projected: ProjectedExecution[] = []
  for (const own of view.executions.values()) {
    if (own.opened === null) continue
    const execution = projectExecution(own, context) as MemoryExecution
    executions.set(JSON.stringify([tenantText, execution.id]), execution)
    for (const [key, record] of projectOperations(own, context)) operations.set(key, record)
    const part = projectFragments(execution, own, context)
    for (const name of FRAGMENT_NAMES)
      for (const [key, value] of part[name])
        (fragments[name] as Map<string, unknown>).set(key, value)
    projected.push({ view: own, execution })
  }
  return { executions, operations, fragments, receiving: projectReceiving(projected, context) }
}
