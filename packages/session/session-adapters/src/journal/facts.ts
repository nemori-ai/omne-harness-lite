// The fact family of the Agent Journal (R2-D292, R2-D294): the kinds of facts one Journal command
// appends, the batch that one command appends them in, the row the `execution-record` participant
// stores one fact in, and the codec between the two. A fact holds identities, evidence, small values
// and references only; the content an external owner keeps (a message, a produced result, a tool
// request, a fixed model request, a journal entry) never enters a fact. The type `NoContent` refuses
// such a value at compile time; `encodeBatch` refuses a fact above `FACT_MAX_BYTES` at run time.
import { createHash } from 'node:crypto'
import type {
  ActionBatchId,
  ActionId,
  Adoption,
  AgentConclusion,
  AgentExecutionId,
  AgentInstanceId,
  AgentJournalEntry,
  AgentOperationId,
  Authority,
  ConsumerRef,
  ConsumptionId,
  ControlStage,
  DurableEvidence,
  ExecutionAttachmentId,
  ExecutionControl,
  FinishCandidateContent,
  HandoffReference,
  InputBatch,
  InputId,
  ModelReplyAdmission,
  PassageId,
  PendingCall,
  StepId,
  Waiting,
} from '@omne-harness/agent-contract'
import type { Message } from '@omne-harness/message'
import type { FixedModelRequest, ModelInvocationRef } from '@omne-harness/model-contract'
import type { ProducedResult } from '@omne-harness/agent-contract'
import type {
  ToolInvocationRef,
  ToolInvokeRequest,
  ToolOperationId,
  ToolOperationRef,
} from '@omne-harness/tool-contract'
import type { JsonValue } from '@omne-harness/sql-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { canonical } from '../testing/canonical.ts'

/** The most bytes one encoded fact body may take: six times a `DurableEvidence` of about 650 B. */
export const FACT_MAX_BYTES = 4096
/** The constant part of one batch besides its facts: the envelope row. */
export const BATCH_OVERHEAD_BYTES = 512
/** The most facts one batch may carry (session-storage-sql `EXECUTION_BATCH_MAX_FACTS`). */
export const BATCH_MAX_FACTS = 256

declare const refTag: unique symbol
/**
 * A content-addressed reference to a value of type `X` kept outside the fact family: in a custody
 * block, in the session history or by a producer. The fact holds the digest and the size; the value
 * is read by the owner of the block at use time, never copied into the fact.
 */
export type Ref<X = unknown> = Readonly<{ digest: string; size: number }> & {
  readonly [refTag]?: X
}

/** The content types of external owners; a fact body never holds one (F5). */
export type ContentType =
  | Message
  | ProducedResult
  | ToolInvokeRequest
  | FixedModelRequest
  | AgentJournalEntry

type IsRef<T> = T extends Readonly<{ digest: string; size: number }> ? true : false
/**
 * Whether a content type occurs anywhere in `T`, to a depth of eight members. A fact body is at
 * most four members deep, so the bound only keeps a recursive type (a JSON value) from looping.
 */
type HasContent<T, Depth extends readonly unknown[] = []> = Depth['length'] extends 8
  ? false
  : T extends ContentType
    ? true
    : IsRef<T> extends true
      ? false
      : T extends readonly (infer E)[]
        ? HasContent<E, [...Depth, 0]>
        : T extends (...args: never) => unknown
          ? true
          : T extends object
            ? true extends { [K in keyof T]-?: HasContent<T[K], [...Depth, 0]> }[keyof T]
              ? true
              : false
            : false
/**
 * `T` when no part of it is a content type, `never` otherwise. The codec and the batch builders
 * take their facts through it, so a fact that carries a message or a request fails to type-check.
 */
export type NoContent<T> = HasContent<T> extends true ? never : T

/** The attempt ordinal of a model intent of one step: `0` for the first, `+1` after each voiding. */
export type Attempt = number

/** How an `exec.attached` came to be: the open, or a recovery with or without takeover. */
export type AttachmentBasis =
  | Readonly<{ kind: 'open' }>
  | Readonly<{ kind: 'recovery'; recovery: DurableEvidence; takeover: DurableEvidence | null }>

/** The producer of a result and the version received, without the result's own body. */
export type ProducerCall = Readonly<{
  producer: 'model' | 'tool'
  call: string
  version: string
  delivery: string | null
  source: DurableEvidence
}>

/** The top-level checkpoint members a `cursor.moved` may carry; a member absent did not change. */
export type CursorMembers = Readonly<{
  position: string
  step: StepId
  inputBatch: string | null
  guard: Ref | null
  priorConditions: DurableEvidence | null
  currentHandoff: HandoffReference | null
  replyAdmissionRead: Readonly<{ kind: 'unverified' }> | Readonly<{ kind: 'verified'; prefix: Ref }>
  compaction: Ref | null
  requestPreparation: Ref | null
  adoptedContext: DurableEvidence | null
  passages: Ref
  completedPassages: readonly PassageId[]
  batch: Ref | null
  calls: Ref
  schema: Adoption
  definition: Adoption
  adoptedRequest: Ref | null
  /** The committed `JournalCommitState`; the waits of a waiting state are in `wait.entered`. */
  state: 'reconciling' | 'advancing' | 'waiting' | 'settling' | 'suspended'
}>
export type CursorMember = keyof CursorMembers

/**
 * The stage of one `result.handled`: the responsibility recorded before any transfer, custody
 * taken, processed, or released by the producer.
 */
export type ResultStage = 'recorded' | 'custody' | 'processed' | 'released'

/**
 * Every fact kind, with the key of each kind in its first members. One fact is one irreducible
 * transition of the responsibility ledger; nothing derived has a kind of its own.
 */
export type FactBody =
  | Readonly<{
      kind: 'exec.opened'
      definition: Adoption
      schema: Adoption
      instance: AgentInstanceId
      scope: DurableEvidence
      original: Readonly<{ input: InputId; entry: AgentOperationId; handoff: HandoffReference }>
      coordination: 'standalone' | 'coordinated'
    }>
  | Readonly<{
      kind: 'exec.attached'
      authority: Authority
      grant: DurableEvidence | null
      basis: AttachmentBasis
    }>
  | Readonly<{
      kind: 'exec.detached'
      attachment: ExecutionAttachmentId
      handoff: DurableEvidence
    }>
  | Readonly<{
      kind: 'input.accepted'
      input: InputId
      entry: AgentOperationId
      message: Ref<Message>
      source: DurableEvidence | null
      priority: 'ordinary' | 'urgent'
      watermark: DurableEvidence
    }>
  | Readonly<{ kind: 'step.begun'; step: StepId; batch: InputBatch }>
  | Readonly<{
      kind: 'request.adopted'
      step: StepId
      attempt: Attempt
      reference: ModelInvocationRef
      fixed: DurableEvidence
      schema: Adoption
      record: Ref<JsonValue>
      coverage: DurableEvidence | null
    }>
  | Readonly<{ kind: 'intent.voided'; step: StepId; attempt: Attempt; basis: DurableEvidence }>
  | Readonly<{
      kind: 'call.intended'
      action: ActionId
      step: StepId
      pending: PendingCall
      authority: Authority
      request: Ref<ToolInvokeRequest> | null
    }>
  | Readonly<{
      kind: 'call.associated'
      action: ActionId
      reference: ToolInvocationRef
      receipt: DurableEvidence
    }>
  | Readonly<{
      kind: 'result.received'
      consumption: ConsumptionId
      delivery: string
      result: ProducerCall
      consumer: ConsumerRef
      custody: Ref<AgentJournalEntry>
      saved: DurableEvidence
    }>
  | Readonly<{
      kind: 'result.handled'
      consumption: ConsumptionId
      result: ProducerCall
      stage: ResultStage
      evidence: DurableEvidence
    }>
  | Readonly<{
      kind: 'reply.judged'
      sequence: number
      fact: ModelReplyAdmission
      basis: DurableEvidence
      publication: DurableEvidence
      message: Ref<Message> | null
      history: DurableEvidence | null
    }>
  /**
   * A message the step published without a handoff or a reply admission to project it: the
   * message is kept by the Session history and the event stream, the fact only refers to it.
   */
  | Readonly<{
      kind: 'message.published'
      step: StepId
      message: Ref<Message>
      source: DurableEvidence
    }>
  | Readonly<{
      kind: 'handoff.prepared'
      handoff: HandoffReference
      request: Ref
      prepared: DurableEvidence
    }>
  | Readonly<{
      kind: 'handoff.resolved'
      handoff: HandoffReference
      resolution: 'recorded' | 'excluded'
      outcome: Ref
      history: DurableEvidence | null
    }>
  | Readonly<{
      kind: 'handoff.retired'
      handoff: HandoffReference
      reason: DurableEvidence
    }>
  | Readonly<{
      kind: 'handoff.recorded'
      handoff: HandoffReference
      resolution: 'recorded' | 'excluded'
      outcome: Ref
      predecessor: AgentOperationId | null
    }>
  | Readonly<{
      kind: 'batch.fixed'
      batch: ActionBatchId
      step: StepId
      source: ProducerCall
      actions: readonly Readonly<{ action: ActionId; callId: string; arguments: Ref }>[]
    }>
  | Readonly<{
      kind: 'action.judged'
      action: ActionId
      judgment: 'pending' | 'waiting' | 'denied' | 'allowed'
      evidence: DurableEvidence | null
      passage: PassageId | null
      request: Ref<ToolInvokeRequest> | null
    }>
  | Readonly<{ kind: 'slot.settled'; action: ActionId; settlement: DurableEvidence }>
  | Readonly<{
      kind: 'passage.declared'
      passage: PassageId
      subject: Ref
      declared: DurableEvidence
    }>
  | Readonly<{
      kind: 'passage.progressed'
      passage: PassageId
      progress: Ref
      round: string | null
    }>
  | Readonly<{
      kind: 'passage.concluded'
      passage: PassageId
      conclusion: Ref
      evidence: DurableEvidence
    }>
  | Readonly<{
      kind: 'control.stage'
      control: AgentOperationId
      command: ExecutionControl
      toolInvocation: ToolInvocationRef | null
      toolOperation: ToolOperationRef | null
      stage: ControlStage
      state: 'reached' | 'unresolved'
      source: DurableEvidence
    }>
  | Readonly<{
      kind: 'control.rejected'
      control: AgentOperationId
      audit: DurableEvidence
    }>
  | Readonly<{ kind: 'wait.entered'; step: StepId; waits: readonly Waiting[] }>
  | Readonly<{
      kind: 'finish.candidate'
      candidate: AgentOperationId
      /** The candidate content with its failure as a reference: a failure names a produced result. */
      claim: Omit<FinishCandidateContent, 'failure'> &
        Readonly<{ failure: Readonly<{ kind: string; detail: Ref }> | null }>
      checkpoint: Ref
      route: DurableEvidence
      supersedes: AgentOperationId | null
    }>
  | Readonly<{ kind: 'finish.proved'; route: DurableEvidence; beforeTerminal: DurableEvidence }>
  /**
   * One issued obligation of a candidate (R2-D297): the item is a reference, so the fact stays
   * small whatever the item holds; the list is folded from the items, never written whole.
   */
  | Readonly<{
      kind: 'finish.obligation'
      candidate: AgentOperationId
      index: number
      category: string
      item: Ref
    }>
  /** The close of one issue of obligations: how many items and the evidence of the list. */
  | Readonly<{
      kind: 'finish.obligations'
      candidate: AgentOperationId
      count: number
      evidence: DurableEvidence
    }>
  /** The disposition of one issued obligation; a state transition, not a rewrite of the list. */
  | Readonly<{
      kind: 'finish.disposed'
      candidate: AgentOperationId
      index: number
      disposition: Ref
    }>
  | Readonly<{
      kind: 'finish.ended'
      candidate: AgentOperationId | null
      conclusion: AgentConclusion
      disposition: DurableEvidence
    }>
  | Readonly<{
      kind: 'settlement.recorded'
      variant: string
      record: Ref
      evidence: DurableEvidence
    }>
  | Readonly<{
      kind: 'observation.recorded'
      terminal: DurableEvidence
      passage: PassageId
      implementation: Adoption
      observed: DurableEvidence
    }>
  | Readonly<{ kind: 'ack.through'; sequence: number }>
  | Readonly<{ kind: 'op.recognized'; target: AgentOperationId }>
  /**
   * The permanent exclusion of an operation (R2-D307): the fence of a takeover over a write of the
   * old generation, a write the storage dropped, a predecessor of a handoff custody chain, or the
   * excluded conclusion of a reception. After it, a write of the operation is refused by decide;
   * exclusion is a fact of the log, never inferred from a missing batch.
   */
  | Readonly<{
      kind: 'op.excluded'
      operation: AgentOperationId
      reason: 'fence' | 'dropped' | 'handoff' | 'reception'
      evidence: DurableEvidence
      predecessor: AgentOperationId | null
    }>
  /** The Tool start fence took effect (R2-D307): the entry `AgentJournalEntries.record` writes. */
  | Readonly<{
      kind: 'fence.started'
      operation: ToolOperationId
      guard: Readonly<{
        owner: string
        resource: string
        revision: string
        evidence: DurableEvidence
      }>
      fence: DurableEvidence
    }>
  | Readonly<{ kind: 'cursor.moved'; step: StepId; members: Partial<CursorMembers> }>

export type FactKind = FactBody['kind']
export type FactOf<K extends FactKind> = Extract<FactBody, { kind: K }>

export const FACT_KINDS: readonly FactKind[] = Object.freeze([
  'exec.opened',
  'exec.attached',
  'exec.detached',
  'input.accepted',
  'step.begun',
  'request.adopted',
  'intent.voided',
  'call.intended',
  'call.associated',
  'result.received',
  'result.handled',
  'reply.judged',
  'message.published',
  'handoff.prepared',
  'handoff.resolved',
  'handoff.retired',
  'handoff.recorded',
  'batch.fixed',
  'action.judged',
  'slot.settled',
  'passage.declared',
  'passage.progressed',
  'passage.concluded',
  'control.stage',
  'control.rejected',
  'wait.entered',
  'finish.candidate',
  'finish.proved',
  'finish.obligation',
  'finish.obligations',
  'finish.disposed',
  'finish.ended',
  'settlement.recorded',
  'observation.recorded',
  'ack.through',
  'op.recognized',
  'op.excluded',
  'fence.started',
  'cursor.moved',
])

/** The event kind a fact projects, or null for a fact that is no event. */
export const EVENT_OF: Readonly<Partial<Record<FactKind, string>>> = Object.freeze({
  'step.begun': 'input-taken',
  'result.received': 'entry',
  'fence.started': 'entry',
  'result.handled': 'producer',
  'reply.judged': 'message',
  'message.published': 'message',
  'control.stage': 'control',
  'wait.entered': 'waiting',
  'finish.ended': 'ended',
})

/** The participation kinds of one batch: the Session commands the same commit carries. */
export type ParticipationKind = 'message' | 'context-transition' | 'custody' | 'processed'

/**
 * The envelope of one batch, in the row `ord = 0`: the operation that appended it, the semantic
 * digest of its input, the revision the batch reaches, the authority generation that wrote it and
 * the participations. `rev` repeats the revision before the batch for a recognition.
 */
export type BatchEnvelope = Readonly<{
  op: AgentOperationId
  digest: string
  rev: number
  gen: string
  kinds: readonly ParticipationKind[]
}>

/** One batch: the envelope and the facts of one command, as one atomic append. */
export type Batch = Readonly<{
  execution: AgentExecutionId
  envelope: BatchEnvelope
  facts: readonly FactBody[]
}>

/** A committed batch with its publication ordinal in the session. */
export type PublishedBatch = Batch & Readonly<{ pub: number }>

/**
 * One row of `er_fact`, as the participant stores it: the key `(tenant, session, pub, ord)`, the
 * execution, the kind, the event sequence of a fact that is an event, the operation of the
 * envelope row, the participation kinds and the encoded body. The envelope row has `ord = 0`,
 * `kind = 'batch'` and the envelope as its body; the facts follow from `ord = 1`.
 */
export type FactRow = Readonly<{
  tenant: string
  session: string
  pub: number
  ord: number
  execution: string
  kind: 'batch' | FactKind
  eseq: number | null
  op: string | null
  kinds: string
  body: string
}>

export type FactFailure =
  | Readonly<{ kind: 'invalid'; field: string; reason: string }>
  | Readonly<{ kind: 'oversize'; ord: number; factKind: FactKind; bytes: number }>
  | Readonly<{ kind: 'too-many'; facts: number; limit: number }>

/** The bytes of the canonical UTF-8 text of a value. */
export function bytesOf(value: unknown): number {
  return Buffer.byteLength(canonical(value), 'utf8')
}

/** A short digest of a canonical text, for cursor members and semantic digests. */
export function digestOf(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex')
}

/** The reference of a value held outside the facts: its digest and size. */
export function refOf<X>(value: X): Ref<X> {
  const text = canonical(value)
  return {
    digest: createHash('sha256').update(text).digest('hex'),
    size: Buffer.byteLength(text, 'utf8'),
  }
}

const CONTENT_KEYS: ReadonlySet<string> = new Set(['role', 'content', 'messages', 'system'])

/**
 * The run-time counterpart of `NoContent`: the first path at which a value carries a discriminating
 * member of a content type (`role`, `content`, `messages`, `system`), or null. A reference, an
 * evidence and an identity never carry one.
 */
export function contentPath(value: unknown, path = ''): string | null {
  if (value === null || typeof value !== 'object') return null
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = contentPath(item, `${path}[${index}]`)
      if (found !== null) return found
    }
    return null
  }
  for (const [key, member] of Object.entries(value)) {
    const at = path === '' ? key : `${path}.${key}`
    if (CONTENT_KEYS.has(key)) return at
    const found = contentPath(member, at)
    if (found !== null) return found
  }
  return null
}

/** The key of one fact: what the ledger it transitions is keyed by. Two facts of one key repeat. */
export function factKey(fact: FactBody): string {
  switch (fact.kind) {
    case 'exec.opened':
      return 'exec'
    case 'exec.attached':
      return `attach/${fact.authority.executionAttachment}`
    case 'exec.detached':
      return `detach/${fact.attachment}`
    case 'input.accepted':
      return `input/${fact.input}`
    case 'step.begun':
      return `step/${fact.step}`
    case 'request.adopted':
      return `request/${fact.step}/${fact.attempt}`
    case 'intent.voided':
      return `voided/${fact.step}/${fact.attempt}`
    case 'call.intended':
      return `call/${fact.action}`
    case 'call.associated':
      return `associated/${fact.action}`
    case 'result.received':
      return `received/${fact.consumption}`
    case 'result.handled':
      return `handled/${fact.consumption}/${fact.stage}`
    case 'reply.judged':
      return `reply/${fact.sequence}`
    case 'message.published':
      return `message/${fact.step}/${fact.message.digest}/${fact.source.record}`
    case 'handoff.prepared':
    case 'handoff.resolved':
    case 'handoff.retired':
    case 'handoff.recorded':
      return `${fact.kind}/${canonical(fact.handoff)}`
    case 'batch.fixed':
      return `batch/${fact.batch}`
    case 'action.judged':
      return `judged/${fact.action}/${fact.judgment}`
    case 'slot.settled':
      return `slot/${fact.action}`
    case 'passage.declared':
      return `passage/${fact.passage}`
    case 'passage.progressed':
      return `progress/${fact.passage}/${fact.progress.digest}`
    case 'passage.concluded':
      return `concluded/${fact.passage}`
    case 'control.stage':
      return `control/${fact.control}/${fact.stage}`
    case 'control.rejected':
      return `rejected/${fact.control}/${fact.audit.record}`
    case 'wait.entered':
      return `wait/${fact.step}/${digestOf(fact.waits)}`
    case 'finish.candidate':
      return `candidate/${fact.candidate}`
    case 'finish.proved':
      return `proved/${fact.route.record}`
    case 'finish.obligation':
      return `obligation/${fact.candidate}/${fact.index}`
    case 'finish.obligations':
      return `obligations/${fact.candidate}`
    case 'finish.disposed':
      return `disposed/${fact.candidate}/${fact.index}/${fact.disposition.digest}`
    case 'finish.ended':
      return 'ended'
    case 'settlement.recorded':
      return `settlement/${fact.variant}/${fact.evidence.record}`
    case 'observation.recorded':
      return `observation/${fact.passage}`
    case 'ack.through':
      return `ack/${fact.sequence}`
    case 'op.recognized':
      return `recognized/${fact.target}`
    case 'op.excluded':
      return `excluded/${fact.operation}`
    case 'fence.started':
      return `fence/${fact.operation}`
    case 'cursor.moved':
      return `cursor/${fact.step}/${digestOf(fact.members)}`
  }
}

/** The batch's own bytes: the envelope overhead and the encoded facts; no custody block. */
export function batchBytes(batch: Batch): number {
  return batch.facts.reduce((sum, fact) => sum + bytesOf(fact), BATCH_OVERHEAD_BYTES)
}

type Scope = Readonly<{ tenant: string; session: string }>

/**
 * Encodes one batch as its rows at publication `pub`. The event sequence of each event fact is
 * assigned from `eseqFrom` upward, so one execution's event sequence stays dense. A fact above
 * `FACT_MAX_BYTES` or carrying a content member is refused; nothing of the batch is encoded.
 */
export function encodeBatch(
  scope: Scope,
  pub: number,
  eseqFrom: number,
  batch: Batch,
): Outcome<Readonly<{ rows: readonly FactRow[]; eseqNext: number }>, FactFailure> {
  if (batch.facts.length > BATCH_MAX_FACTS)
    return fail({ kind: 'too-many', facts: batch.facts.length, limit: BATCH_MAX_FACTS })
  const kinds = batch.envelope.kinds.join(',')
  const base = { tenant: scope.tenant, session: scope.session, pub, execution: batch.execution }
  const rows: FactRow[] = [
    {
      ...base,
      ord: 0,
      kind: 'batch',
      eseq: null,
      op: batch.envelope.op,
      kinds,
      body: canonical(batch.envelope),
    },
  ]
  let eseq = eseqFrom
  for (const [index, fact] of batch.facts.entries()) {
    const ord = index + 1
    const found = contentPath(fact)
    if (found !== null)
      return fail({ kind: 'invalid', field: `facts[${index}].${found}`, reason: 'content' })
    const body = canonical(fact)
    const bytes = Buffer.byteLength(body, 'utf8')
    if (bytes > FACT_MAX_BYTES) return fail({ kind: 'oversize', ord, factKind: fact.kind, bytes })
    const event = EVENT_OF[fact.kind] !== undefined
    rows.push({
      ...base,
      ord,
      kind: fact.kind,
      eseq: event ? ++eseq : null,
      op: null,
      kinds,
      body,
    })
  }
  return succeed({ rows, eseqNext: eseq })
}

const KINDS: ReadonlySet<string> = new Set(FACT_KINDS)
const PARTICIPATIONS: ReadonlySet<string> = new Set([
  'message',
  'context-transition',
  'custody',
  'processed',
])

function parse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

function envelopeOf(value: unknown, kinds: string): BatchEnvelope | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const names = kinds === '' ? [] : kinds.split(',')
  if (
    typeof record['op'] !== 'string' ||
    typeof record['digest'] !== 'string' ||
    typeof record['rev'] !== 'number' ||
    !Number.isSafeInteger(record['rev']) ||
    typeof record['gen'] !== 'string' ||
    !names.every(name => PARTICIPATIONS.has(name))
  )
    return null
  return {
    op: record['op'] as AgentOperationId,
    digest: record['digest'],
    rev: record['rev'],
    gen: record['gen'],
    kinds: names as ParticipationKind[],
  }
}

/**
 * Decodes the rows of one publication back into the batch. The rows must be one publication, with
 * the envelope at `ord = 0` and the facts dense from `ord = 1`; anything else is `invalid`, never a
 * shorter batch.
 */
export function decodeBatch(rows: readonly FactRow[]): Outcome<PublishedBatch, FactFailure> {
  const [head] = rows
  if (head === undefined) return fail({ kind: 'invalid', field: 'rows', reason: 'empty' })
  if (head.ord !== 0 || head.kind !== 'batch' || head.op === null)
    return fail({ kind: 'invalid', field: 'rows[0]', reason: 'no envelope' })
  const envelope = envelopeOf(parse(head.body), head.kinds)
  if (envelope === null || envelope.op !== head.op)
    return fail({ kind: 'invalid', field: 'rows[0].body', reason: 'malformed envelope' })
  const facts: FactBody[] = []
  for (const [index, row] of rows.entries()) {
    if (index === 0) continue
    if (row.pub !== head.pub || row.execution !== head.execution || row.ord !== index)
      return fail({ kind: 'invalid', field: `rows[${index}]`, reason: 'not the same batch' })
    if (!KINDS.has(row.kind))
      return fail({ kind: 'invalid', field: `rows[${index}].kind`, reason: 'unknown kind' })
    const body = parse(row.body)
    if (body === null || typeof body !== 'object' || (body as { kind?: unknown }).kind !== row.kind)
      return fail({ kind: 'invalid', field: `rows[${index}].body`, reason: 'malformed body' })
    facts.push(body as FactBody)
  }
  return succeed({
    execution: head.execution as AgentExecutionId,
    envelope,
    facts,
    pub: head.pub,
  })
}

/** Groups the rows of a range read `pub > head ORDER BY pub, ord` into their batches. */
export function decodeRows(
  rows: readonly FactRow[],
): Outcome<readonly PublishedBatch[], FactFailure> {
  const batches: PublishedBatch[] = []
  let start = 0
  for (let index = 1; index <= rows.length; index += 1) {
    if (index === rows.length || rows[index]!.pub !== rows[start]!.pub) {
      const decoded = decodeBatch(rows.slice(start, index))
      if ('failure' in decoded) return decoded
      batches.push(decoded.ok)
      start = index
    }
  }
  return succeed(batches)
}
