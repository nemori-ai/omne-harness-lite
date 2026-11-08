// The reader records of one execution projected from the folded view and the content blocks
// (session-adapters SPEC "事实族存储"): what the K-23 bridge rebuilds from its `core.*` facts,
// derived from the fact family instead. The projection is field by field, so that its parity with
// the writer's records can be measured one field at a time (tests/journal-records-parity.spec.ts):
// `projectExecution` answers the fields it derives, `fieldsDiff` names the fields that equal the
// writer's, differ from them, or are not derived yet. A field derived here no longer needs the
// bridge; the bridge is removed once every field is.
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
  HandoffResolution,
  PendingCall,
  ReceivedEntry,
  ResultResponsibility,
  TerminalObservation,
} from '@omne-harness/agent-contract'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { canonical } from './canonical.ts'
import {
  batchEvidence,
  checkpointOf,
  type BlobStore,
  type ExecutionView,
  type Mint,
  type OperationEntry,
  type PublishedBatch,
  type SessionJournalView,
} from '../journal/index.ts'
import {
  operationText,
  type AdmissionLedger,
  type AdmissionProjection,
  type AdmissionRecord,
  type HandoffRecord,
  type MemoryExecution,
  type OperationRecord,
} from './journal.ts'
import { finishingOf, settlementOfFact } from './journal-finishing.ts'
import {
  bindTarget,
  emptyReceivingState,
  type Kept,
  type ReceivingState,
} from './journal-receiving.ts'
import { journalEvidence, revisionOf, semanticKey } from './journal-values.ts'
import { captureHuman } from './human.ts'
import type { CommonRoot } from './root.ts'

/** Every field of the reader record, in the order the bridge serializes them. */
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

/** What the projection reads besides the view: the blocks, the tenant, and the batch mint. */
export type ProjectionContext = Readonly<{
  tenant: TenantId
  blobs: BlobStore
  mint: Mint
  /** The schema the Journal stamps on every event (its `eventSchema` option). */
  eventSchema: Adoption
  /** The reply admission rule of the Journal (its `replyAdmissionRule` option). */
  admissionRule: Adoption
}>

type CustodyAttempt = MemoryExecution['custodyAttempts'] extends Map<unknown, infer V> ? V : never

/** The operation entries of the execution by the publication of their batch (recognitions apart). */
function opsByPub(view: ExecutionView): Map<number, [AgentOperationId, OperationEntry]> {
  const out = new Map<number, [AgentOperationId, OperationEntry]>()
  for (const [op, entry] of view.ops) if (entry.target === null) out.set(entry.pub, [op, entry])
  return out
}

/** The receipt of the batch at `pub`, as `append` derived it when the batch was written. */
function receiptAt(
  view: ExecutionView,
  byPub: ReadonlyMap<number, [AgentOperationId, OperationEntry]>,
  mint: Mint,
  pub: number,
): CommandReceipt | undefined {
  const found = byPub.get(pub)
  if (found === undefined) return undefined
  const [operation, entry] = found
  return {
    operation,
    execution: view.execution,
    revision: revisionOf(entry.revision),
    evidence: batchEvidence(
      mint,
      { execution: view.execution, pub, envelope: { digest: entry.digest } } as PublishedBatch,
      entry.revision,
    ),
    state: 'applied',
  }
}

/** The publication a batch evidence names, or null for another evidence. */
function pubOf(evidence: DurableEvidence): number | null {
  const found = /\/pub\/(\d+)$/u.exec(evidence.record)
  return found === null ? null : Number(found[1])
}

/**
 * The value a reference names. A `blobOf` pair (`[digest, value]`, which the core's `open` still
 * writes for the accepted message, K-23) carries its value; a reference is looked up by digest.
 */
/** The reader's ProducedResult of a fact's ProducerCall. */
function producedOf(
  result: Readonly<{
    producer: 'model' | 'tool'
    call: string
    version: string
    delivery: string | null
    source: DurableEvidence
  }>,
): ResultResponsibility['result'] {
  return {
    producer: { kind: result.producer, call: result.call } as never,
    version: result.version,
    delivery: result.delivery,
    source: result.source,
  }
}

/** The event body a fact projects (the reader's AgentEventBody), or null for a fact that is none. */
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
      return { kind: 'waiting', waits: fact.waits }
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

/** The state of the execution as the reader records keep it (the settling intent apart). */
/**
 * The committed state: the latest of the facts that set it. The end stands; a detach with its
 * handoff suspends; a candidate established (settling), an attach (reconciling, after the first)
 * and the `state` member of the cursor (what a commit committed, with the waits of a waiting state
 * from the wait entered then) each at their pub, the latest wins.
 */
function stateOf(view: ExecutionView): MemoryExecution['state'] {
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
        : { kind: 'waiting', waits: view.waits.waits }
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

/**
 * The reader record of `view`, field by field. A field this projection does not derive yet is
 * absent; `fieldsDiff` reports it as missing.
 */
export function projectExecution(
  view: ExecutionView,
  context: ProjectionContext,
): Partial<MemoryExecution> {
  const byPub = opsByPub(view)
  const receipt = (pub: number) => receiptAt(view, byPub, context.mint, pub)
  const projected: Partial<MemoryExecution> = {
    id: view.execution,
    tenant: context.tenant,
    revision: view.revision,
    state: stateOf(view) as MemoryExecution['state'],
    attachments: view.attachments.map(item => ({
      authority: item.authority,
      grant: item.grant,
      status: item.status,
      handoff: item.handoff,
      handoffRevision: item.handoffRevision,
    })),
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
    // The writer's record carries a Tool reference only when the control has one: the fact
    // stores null for none, and a null reference is not a reference (`toolInvocationOf`).
    controls: [...view.controls.values()].map(
      item =>
        ({
          operation: item.control,
          command: item.command,
          ...(item.toolInvocation === null ? {} : { toolInvocation: item.toolInvocation }),
          ...(item.toolOperation === null ? {} : { toolOperation: item.toolOperation }),
          stages: item.stages,
        }) as unknown as ControlRecord,
    ),
    // A responsibility is on record once `recordResult` reached a stage; a reception alone is not.
    results: [...view.results.values()]
      .filter(item => Object.keys(item.stages).length > 0)
      .map((item): ResultResponsibility => ({
        result: {
          producer: { kind: item.result.producer, call: item.result.call } as never,
          version: item.result.version,
          delivery: item.result.delivery,
          source: item.result.source,
        },
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
    observed: new Map(
      view.observations.flatMap(item => {
        const found = receipt(item.pub)
        return found === undefined ? [] : [[item.passage, found]]
      }),
    ),
    stageReceipts: new Map(
      [...view.controls.values()].flatMap(control =>
        Object.entries(control.stages).flatMap(([stage, fact]) => {
          const pub = fact === undefined ? null : pubOf(fact.source)
          const found = pub === null ? undefined : receipt(pub)
          return found === undefined
            ? []
            : [[JSON.stringify([control.control, stage]), found] as [string, CommandReceipt]]
        }),
      ),
    ),
    admissions: view.admissions.map((item): AdmissionRecord => ({
      fact: item.fact,
      publication: item.publication,
      basis: item.basis,
      present: true,
    })),
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
    // An execution whose cursor was never moved whole (no checkpoint yet): the field stays absent.
    // Any other failure is a defect of the records, not a missing checkpoint.
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
  const revisionAt = (pub: number): number | undefined => byPub.get(pub)?.[1].revision
  const opAt = (pub: number): AgentOperationId | undefined => byPub.get(pub)?.[0]
  // Events: the AgentEvent of each event fact, caused by the receipt evidence of its batch (the
  // end by its disposition).
  projected.events = view.events.flatMap((event): AgentEvent[] => {
    const body = bodyOf(event.fact, context.blobs)
    const found = receipt(event.pub)
    if (body === null || found === undefined) return []
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
  // The finishing records, projected from the folded facts with the batch mint.
  projected.finishing = finishingOf(view, context.blobs, {
    receipt: (op, pub, revision) => ({
      operation: op,
      execution: view.execution,
      revision: revisionOf(revision),
      evidence: batchEvidence(
        context.mint,
        {
          execution: view.execution,
          pub,
          envelope: { digest: view.ops.get(op)?.digest ?? '' },
        } as PublishedBatch,
        revision,
      ),
      state: 'applied',
    }),
    checkpoint: (candidate, revision) =>
      journalEvidence(
        `${context.mint.session}/${view.execution}/candidate/${candidate}/checkpoint`,
        revision,
      ),
  })
  // The revision each result responsibility last reached: the batch of its latest stage.
  projected.resultRevisions = new Map(
    [...view.results.values()].flatMap(item => {
      const pubs = Object.values(item.stages).flatMap(stage =>
        stage === undefined ? [] : [pubOf(stage) ?? 0],
      )
      const revision = pubs.length === 0 ? undefined : revisionAt(Math.max(...pubs))
      if (revision === undefined) return []
      const key = semanticKey('responsibility', [
        { kind: item.result.producer, call: item.result.call },
        item.result.version,
        item.consumption,
      ])
      return [[key, revision] as [string, number]]
    }),
  )
  // The reply admission ledger: the origin the open minted, and the projection folded from it.
  const parts = [...(JSON.parse(context.mint.session) as string[]), view.execution]
  const originRevision = view.opened === null ? 1 : (revisionAt(view.opened.pub) ?? 1)
  const origin = journalEvidence(
    `${JSON.stringify(parts)}/reply-admission-prefix/0`,
    originRevision,
  )
  let projection: AdmissionProjection = {
    rule: context.admissionRule,
    consecutive: 0,
    total: 0,
    last: null,
    sequence: 0,
    basis: origin,
  }
  for (const item of view.admissions)
    projection =
      item.fact.decision === 'rejected'
        ? {
            ...projection,
            consecutive: projection.consecutive + 1,
            total: projection.total + 1,
            sequence: projection.sequence + 1,
            basis: item.basis,
          }
        : {
            ...projection,
            consecutive: 0,
            last: item.fact.source,
            sequence: projection.sequence + 1,
            basis: item.basis,
          }
  const ledger: AdmissionLedger = { origin, retainedFrom: 1, rangesFrom: 0, projection }
  projected.admissionLedger = ledger
  // Handoffs: each H as the reader records keep it.
  projected.handoffs = [...view.handoffs.values()].flatMap((item): HandoffRecord[] => {
    const outcome =
      item.resolved === null ? null : blob<HandoffOutcome>(context.blobs, item.resolved.outcome)
    const excluded =
      item.retired === null
        ? null
        : blob<Extract<HandoffResolution, { kind: 'excluded' }>>(
            context.blobs,
            item.retired.excluded,
          )
    const request =
      item.prepared !== null
        ? blob<HandoffRecord['request']>(context.blobs, item.prepared.request)
        : (outcome?.request ?? excluded?.request)
    if (request === undefined) return []
    const resolution: HandoffRecord['resolution'] =
      outcome !== null ? { kind: 'recorded', outcome } : excluded
    const history: HandoffRecord['history'] =
      item.retired !== null
        ? { kind: 'not-applicable' }
        : item.resolved !== null && (item.prepared === null || item.resolved.history !== null)
          ? {
              kind: 'committed',
              operation: opAt(item.resolved.pub) as AgentOperationId,
              revision: revisionOf(item.resolved.revision),
            }
          : ended !== null
            ? { kind: 'retained', disposition: ended.disposition }
            : { kind: 'pending' }
    return [
      {
        handoff: item.handoff,
        request,
        prepared: item.prepared?.prepared ?? null,
        resolution,
        history,
        retirement:
          item.retired === null
            ? null
            : {
                operation: opAt(item.retired.pub) as AgentOperationId,
                revision: revisionOf(item.retired.revision),
                reason: item.retired.reason,
              },
      },
    ]
  })
  // The Rh custody attempts, by operation: the original and the custody the attempt carried.
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
  // The evidence serial starts at the open's publication and is advanced only by the legacy
  // seeding controls of the tests.
  projected.serial = view.opened === null ? 0 : view.opened.pub
  return projected
}

/** The method a semantic key names: its prefix before the first colon. */
const methodOf = (key: string): string => key.split(':')[0] ?? ''

/** The receipt state a method's receipt names: an accepting command answers `accepted`. */
const stateOf2 = (method: string): CommandReceipt['state'] =>
  method === 'submit' || method === 'control' ? 'accepted' : 'applied'

/**
 * The operation records of one execution projected from the fold: a committed record for every
 * operation of the index, with the answer its batch derives (by the method the semantic key names,
 * from what the view and the blocks hold of that batch), an excluded record for every exclusion,
 * and a rejected record for every persistent rejection. The key of an excluded record is the
 * semantic key of a write that never published; the facts do not hold it, so it is empty here.
 */
export function projectOperations(
  view: ExecutionView,
  context: ProjectionContext,
  execution: Partial<MemoryExecution>,
): Map<string, OperationRecord> {
  const out = new Map<string, OperationRecord>()
  const byPub = opsByPub(view)
  const text = tenantCodec.encode(context.tenant)
  const tenantText = text.ok ? text.value : ''
  const keyOf = (op: AgentOperationId) => operationText(tenantText, view.execution, op)
  const receiptFor = (op: AgentOperationId, entry: OperationEntry): CommandReceipt => {
    const method = methodOf(entry.digest)
    if (entry.target !== null && entry.recalls) {
      const target = view.ops.get(entry.target)
      const found =
        target === undefined ? undefined : receiptAt(view, byPub, context.mint, target.pub)
      if (found !== undefined) return found
    }
    return {
      operation: op,
      execution: view.execution,
      revision: revisionOf(entry.revision),
      evidence: batchEvidence(
        context.mint,
        {
          execution: view.execution,
          pub: entry.pub,
          envelope: { digest: entry.digest },
        } as PublishedBatch,
        entry.revision,
      ),
      state: stateOf2(method),
    }
  }
  const finishing = execution.finishing
  const valueOf = (
    op: AgentOperationId,
    entry: OperationEntry,
    receipt: CommandReceipt,
  ): unknown => {
    const method = methodOf(entry.digest)
    // A recognition answers from the batch it recognized.
    const at = entry.target === null ? entry.pub : (view.ops.get(entry.target)?.pub ?? entry.pub)
    switch (method) {
      case 'open':
      case 'attach': {
        const attachment = view.attachments.find(item => item.pub === at)
        return { receipt, authority: attachment?.authority }
      }
      case 'detach': {
        const detached = view.attachments.find(
          item => item.handoff !== null && item.handoffRevision === entry.revision,
        )
        return detached?.handoff
      }
      case 'prepareFinish': {
        const list = [...view.finish.lists.values()].find(item => item.issued.pub === at)
        return { receipt, obligations: list?.issued.evidence }
      }
      case 'tryFinish':
        return { kind: 'ended', receipt }
      case 'commitSettlement': {
        const settlement = view.settlements.find(item => item.pub === at)
        if (settlement !== undefined && finishing !== undefined)
          return settlementOfFact(settlement.record, receipt, finishing, context.blobs)
        const candidate = finishing?.candidates.find(item => item.candidate === op)
        const route = finishing?.routes.find(
          item => item.kind === 'cancellation' && item.candidate === op,
        )
        return {
          kind: 'establish-cancellation',
          receipt,
          candidate,
          route,
          supersession: finishing?.supersessions.find(item => item.to === op) ?? null,
        }
      }
      case 'received': {
        const received = [...view.results.values()].find(item => item.received?.pub === at)
        if (received?.received === null || received === undefined) return undefined
        return {
          kind: 'committed',
          value: {
            entry: blob(context.blobs, received.received.custody),
            receipt,
            saved: received.received.saved,
          },
        }
      }
      case 'preserve': {
        const material = [...view.materials.values()].find(item => item.pub === at)
        return material?.source
      }
      default:
        return receipt
    }
  }
  for (const [op, entry] of view.ops) {
    const receipt = receiptFor(op, entry)
    out.set(keyOf(op), {
      kind: 'committed',
      key: entry.digest,
      value: valueOf(op, entry, receipt),
      receipt,
    })
  }
  for (const [op, entry] of view.rejections)
    out.set(keyOf(op), {
      kind: 'rejected',
      key: view.ops.get(op)?.digest ?? '',
      failure: { kind: 'conflict', operation: op },
      audit: entry.audit,
      revision: revisionOf(entry.revision),
    })
  for (const [op, entry] of view.excluded)
    if (!out.has(keyOf(op)))
      out.set(keyOf(op), {
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
  canonical(value instanceof Map ? [...value.entries()].sort() : value)

/** Compares the writer's record with a projection, field by field, by canonical text. */
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

/** The two texts of one differing field, for a report. */
export function fieldTexts(
  expected: MemoryExecution,
  actual: Partial<MemoryExecution>,
  field: ExecutionField,
): Readonly<{ expected: string; actual: string }> {
  return { expected: text(expected[field]), actual: text(actual[field]) }
}

export type { ExecutionState }

// ---------------------------------------------------------------------------------------------
// The records beside the executions (K-23 end state): the original fragments of the events, the
// receiving state, and the whole root of a session, derived from the fold and the blocks the
// same way at a cold start of the provider and in the parity measurement.

/** The original fragments of the events the normalization reads, and the event index. */
export type EventFragments = Pick<
  CommonRoot['agent'],
  'eventReceipts' | 'pendingEvents' | 'callOrigins' | 'human' | 'indexedEvents'
>

export const emptyFragments = (): EventFragments => ({
  eventReceipts: new Map(),
  pendingEvents: new Map(),
  callOrigins: new Map(),
  human: new Map(),
  indexedEvents: new Map(),
})

/** The Pending calls one event names: the producer waits of a waiting event, the origin of a producer event. */
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

/** Keeps the first call event of a consumption, and the event that associates a Tool intent with its call. */
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

/**
 * The original fragments of the events of one execution: the receipt of the batch that appended
 * each event, the Pending calls it names, the first call event of each consumption with its Tool
 * association, and the human material of a human wait, read from the passages of the checkpoint
 * as it stands (the writer read them when the event was appended; a passage no longer held leaves
 * its fragment out, as a fragment that cannot be read is left out at the write). `indexedEvents`
 * is the count of the events held.
 */
export function projectFragments(
  execution: MemoryExecution,
  view: ExecutionView,
  context: ProjectionContext,
): EventFragments {
  const out = emptyFragments()
  const byPub = opsByPub(view)
  const pubOfSequence = new Map(view.events.map(event => [String(event.eseq), event.pub]))
  out.indexedEvents.set(execution.id, execution.events.length)
  for (const event of execution.events) {
    const key = `${execution.id}\0${event.sequence}`
    const pub = pubOfSequence.get(event.sequence)
    const receipt = pub === undefined ? undefined : receiptAt(view, byPub, context.mint, pub)
    if (receipt === undefined) continue
    out.eventReceipts.set(key, receipt)
    const pending = pendingsOf(out.callOrigins, execution, event)
    out.pendingEvents.set(key, pending)
    for (const value of pending) originOf(out.callOrigins, execution, event, value)
    if (event.body.kind === 'waiting' && event.body.waits.some(wait => wait.kind === 'human')) {
      try {
        out.human.set(key, captureHuman(event, execution.checkpoint, receipt))
      } catch {
        // A human wait whose passage the checkpoint no longer holds: its fragment is left out.
      }
    }
  }
  return out
}

/** One projected execution with the view it was projected from. */
export type ProjectedExecution = Readonly<{ view: ExecutionView; execution: MemoryExecution }>

/**
 * The receiving state of a session from the facts of its executions, applied in publication
 * order as the writes applied them: the bindings of the pending calls (`target.bound`), the
 * saved deliveries with their aliases and materials (`result.received`, with `saved` only for a
 * delivery the receiver committed, as the writer keeps it), the aliases of the operations that
 * recalled a delivery (`op.recognized` with `recalls`), and the materials kept (`material.preserved`,
 * under the execution of their consumer as bound then). The test-only bindings (`bind`) and the
 * losses are not facts.
 */
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
    const byPub = opsByPub(view)
    const keyOf = (op: AgentOperationId) => operationText(tenantText, execution.id, op)
    for (const binding of view.bindings)
      items.push({
        pub: binding.pub,
        ord: 2,
        apply: () =>
          bindTarget(state, execution, binding.instance, blob(context.blobs, binding.pending)),
      })
    for (const result of view.results.values()) {
      const received = result.received
      if (received === null) continue
      const found = byPub.get(received.pub)
      const receipt = receiptAt(view, byPub, context.mint, received.pub)
      if (found === undefined || receipt === undefined) continue
      const [op, entry] = found
      const value = blob<ReceivedEntry>(context.blobs, received.custody)
      const kept: Kept = {
        entry: value,
        receipt,
        saved: methodOf(entry.digest) === 'received' ? received.saved : null,
      }
      const delivery = canonical([
        tenantText,
        execution.id,
        value.delivery.producer,
        value.delivery.key,
      ])
      items.push({
        pub: received.pub,
        ord: 1,
        apply: () => {
          state.deliveries.set(delivery, kept)
          state.aliases.set(keyOf(op), kept)
          if (received.material !== null)
            state.materials.set(canonical(value.material), {
              tenant: tenantText,
              execution: execution.id,
              value: blob(context.blobs, received.material),
            })
        },
      })
    }
    for (const [op, entry] of view.ops) {
      if (entry.target === null || !entry.recalls) continue
      const target = entry.target
      items.push({
        pub: entry.pub,
        ord: 3,
        apply: () => {
          const kept = state.aliases.get(keyOf(target))
          if (kept !== undefined) state.aliases.set(keyOf(op), kept)
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
            execution:
              state.consumerExecutions.get(canonical([tenantText, material.consumer])) ?? null,
            value: blob(context.blobs, material.value),
          })
        },
      })
  }
  items.sort((left, right) => left.pub - right.pub || left.ord - right.ord)
  for (const item of items) item.apply()
  return state
}

/** The records of a session projected from its fold: what a provider restores at a cold start. */
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

/**
 * Every record of the session from its fold and blocks: the executions (by the key the root keeps
 * them under, `[tenant, execution]`), the operation records, the event fragments and the receiving
 * state. A view of an execution never opened projects no record.
 */
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
    for (const [key, record] of projectOperations(own, context, execution))
      operations.set(key, record)
    const part = projectFragments(execution, own, context)
    for (const name of FRAGMENT_NAMES)
      for (const [key, value] of part[name])
        (fragments[name] as Map<string, unknown>).set(key, value)
    projected.push({ view: own, execution })
  }
  return { executions, operations, fragments, receiving: projectReceiving(projected, context) }
}
