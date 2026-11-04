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
import { journalEvidence, revisionOf, semanticKey } from './journal-values.ts'

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
function stateOf(view: ExecutionView): MemoryExecution['state'] {
  const ended = view.finish.ended
  if (ended !== null)
    return { kind: 'ended', conclusion: ended.conclusion, disposition: ended.disposition }
  const last = view.attachments.at(-1)
  if (last?.status === 'detached' && last.handoff !== null)
    return { kind: 'suspended', handoff: last.handoff }
  if (view.finish.current !== null) return { kind: 'settling' }
  // A wait entered after the last attachment, and no cursor move after it, is the state.
  const waits = view.waits
  const moved = Math.max(0, ...Object.values(view.cursorMoved))
  if (waits !== null && waits.pub > (last?.pub ?? 0) && waits.pub >= moved)
    return { kind: 'waiting', waits: waits.waits }
  if (last !== undefined && last.pub > moved && view.attachments.length > 1)
    return { kind: 'reconciling' }
  return { kind: 'advancing' }
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
    controls: [...view.controls.values()].map(
      item =>
        ({
          operation: item.control,
          command: item.command,
          toolInvocation: item.toolInvocation,
          toolOperation: item.toolOperation,
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
  } catch {
    // An execution whose cursor was never moved whole (no checkpoint yet): the field stays absent.
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
  const ended = view.finish.ended
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
      out.set(keyOf(op), { kind: 'excluded', key: '', evidence: entry.evidence })
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
