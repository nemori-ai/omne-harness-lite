import { createHash } from 'node:crypto'
import type {
  ActionId,
  Adoption,
  AgentConclusion,
  AgentExecutionId,
  AgentInstanceId,
  AgentJournalEntry,
  AgentOperationId,
  Authority,
  ConsumerRef,
  CompactionTaskIdentity,
  ConsumptionId,
  ControlStage,
  DurableEvidence,
  ExecutionAttachmentId,
  ExecutionControl,
  FinishCandidateContent,
  FinishRoute,
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
import { EXECUTION_BATCH_MAX_FACTS } from '@omne-harness/session-storage-sql/participants'
import { canonical } from '../testing/canonical.ts'

export const FACT_MAX_BYTES = 4096
export const BATCH_OVERHEAD_BYTES = 512
export const BATCH_MAX_FACTS = EXECUTION_BATCH_MAX_FACTS - 1

declare const refTag: unique symbol
export type Ref<X = unknown> = Readonly<{ digest: string; size: number }> & {
  readonly [refTag]?: X
}

export type ContentType =
  | Message
  | ProducedResult
  | ToolInvokeRequest
  | FixedModelRequest
  | AgentJournalEntry

type IsRef<T> = T extends Readonly<{ digest: string; size: number }> ? true : false
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
export type NoContent<T> = HasContent<T> extends true ? never : T

export type Attempt = number

export type AttachmentBasis =
  | Readonly<{ kind: 'open' }>
  | Readonly<{ kind: 'recovery'; recovery: DurableEvidence; takeover: DurableEvidence | null }>

export type ProducerCall = (
  | Readonly<{ producer: 'model' | 'tool'; call: string }>
  | Readonly<{ producer: 'compaction'; task: CompactionTaskIdentity }>
) &
  Readonly<{
    version: string
    delivery: string | null
    source: DurableEvidence
  }>

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
  state: 'reconciling' | 'advancing' | 'waiting' | 'settling' | 'suspended'
  // What the checkpoint holds open that its blocks name: the fold reads it without the blocks.
  holds: Readonly<{
    actions: readonly ActionId[]
    consumptions: readonly ConsumptionId[]
    handoffs: readonly string[]
    // The sequence of the reply admission prefix the checkpoint has verified (0: none).
    admissionsFrom: number
  }>
}>
export type CursorMember = keyof CursorMembers

export type ResultStage = 'recorded' | 'custody' | 'processed' | 'released'

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
  | Readonly<{
      kind: 'intent.voided'
      intent: 'model'
      step: StepId
      attempt: Attempt
      action: ActionId
      reference: ModelInvocationRef
      cause: 'not-accepted' | 'lost'
      basis: DurableEvidence
    }>
  | Readonly<{
      kind: 'intent.voided'
      intent: 'tool'
      step: StepId
      action: ActionId
      cause: 'not-accepted'
      basis: DurableEvidence
    }>
  | Readonly<{
      kind: 'call.intended'
      action: ActionId
      step: StepId
      pending: PendingCall
      authority: Authority
      request: Ref<ToolInvokeRequest> | null
    }>
  | Readonly<{
      kind: 'result.received'
      consumption: ConsumptionId
      delivery: string
      result: ProducerCall
      consumer: ConsumerRef
      custody: Ref<AgentJournalEntry>
      saved: DurableEvidence
      material: Ref | null
    }>
  | Readonly<{
      kind: 'result.handled'
      consumption: ConsumptionId
      result: ProducerCall
      stage: ResultStage
      evidence: DurableEvidence
      step: StepId | null
    }>
  | Readonly<{
      kind: 'reply.judged'
      sequence: number
      fact: ModelReplyAdmission
      basis: DurableEvidence
      publication: DurableEvidence
      message: Ref<Message> | null
      source: DurableEvidence | null
      history: DurableEvidence | null
    }>
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
      excluded: Ref
    }>
  | Readonly<{
      kind: 'handoff.recorded'
      handoff: HandoffReference
      resolution: 'recorded' | 'excluded'
      outcome: Ref
      predecessor: AgentOperationId | null
      custody: Ref | null
    }>
  | Readonly<{
      kind: 'control.stage'
      control: AgentOperationId
      command: ExecutionControl
      modelInvocation: ModelInvocationRef | null
      toolInvocation: ToolInvocationRef | null
      toolOperation: ToolOperationRef | null
      stage: ControlStage
      state: 'reached' | 'unresolved'
      source: DurableEvidence
      step: StepId | null
    }>
  | Readonly<{
      kind: 'control.rejected'
      control: AgentOperationId
      audit: DurableEvidence
    }>
  | Readonly<{ kind: 'wait.entered'; step: StepId; waits: Ref<readonly Waiting[]> }>
  | Readonly<{
      kind: 'target.bound'
      reference: string
      pending: Ref<PendingCall>
      consumption: ConsumptionId
      instance: AgentInstanceId
    }>
  | Readonly<{
      kind: 'finish.candidate'
      candidate: AgentOperationId
      claim: Omit<FinishCandidateContent, 'failure'> &
        Readonly<{ failure: Readonly<{ kind: string; detail: Ref }> | null }>
      cursor: Ref<CursorMembers>
      route: DurableEvidence
      path: Ref<FinishRoute>
      supersedes: AgentOperationId | null
    }>
  | Readonly<{ kind: 'finish.proved'; route: DurableEvidence; beforeTerminal: DurableEvidence }>
  | Readonly<{
      kind: 'finish.obligation'
      id: string
      category: string
      item: Ref | null
      // Whether the obligation is settled: the ledger keeps an unsettled one open.
      settled: boolean
    }>
  | Readonly<{
      kind: 'finish.obligations'
      candidate: AgentOperationId
      list: number
      count: number
      evidence: DurableEvidence
      coverage: Ref
      listed: Ref
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
  // A recognition names the batch of the operation it recognizes: that operation has left memory.
  | Readonly<{
      kind: 'op.recognized'
      target: AgentOperationId
      at: Readonly<{ pub: number; digest: string; revision: number }>
      recalls?: true
    }>
  | Readonly<{
      kind: 'material.preserved'
      source: DurableEvidence
      value: Ref
      consumer: ConsumerRef
    }>
  | Readonly<{
      kind: 'op.excluded'
      operation: AgentOperationId
      reason: ExclusionReason
      evidence: DurableEvidence
      predecessor: AgentOperationId | null
    }>
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
  'result.received',
  'result.handled',
  'reply.judged',
  'message.published',
  'handoff.prepared',
  'handoff.resolved',
  'handoff.retired',
  'handoff.recorded',
  'control.stage',
  'control.rejected',
  'wait.entered',
  'finish.candidate',
  'finish.proved',
  'finish.obligation',
  'finish.obligations',
  'finish.ended',
  'settlement.recorded',
  'observation.recorded',
  'ack.through',
  'op.recognized',
  'op.excluded',
  'fence.started',
  'cursor.moved',
  'material.preserved',
  'target.bound',
])

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

export type ExclusionReason = 'fence' | 'dropped' | 'handoff' | 'reception' | 'no-write'

export const REVIVABLE_EXCLUSIONS: ReadonlySet<ExclusionReason> = new Set<ExclusionReason>([
  'dropped',
  'no-write',
])

export function eventKindOf(fact: FactBody): string | null {
  const kind = EVENT_OF[fact.kind]
  if (kind === undefined) return null
  if (fact.kind === 'reply.judged' && (fact.message === null || fact.source === null)) return null
  if (fact.kind === 'result.handled' && fact.step === null) return null
  return kind
}

export type ParticipationKind =
  | 'message'
  | 'delivered'
  | 'context-transition'
  | 'custody'
  | 'processed'

export type BatchEnvelope = Readonly<{
  op: AgentOperationId
  digest: string
  rev: number
  gen: string
  kinds: readonly ParticipationKind[]
}>

export type Batch = Readonly<{
  execution: AgentExecutionId
  envelope: BatchEnvelope
  facts: readonly FactBody[]
}>

export type PublishedBatch = Batch & Readonly<{ pub: number }>

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

export function bytesOf(value: unknown): number {
  return Buffer.byteLength(canonical(value), 'utf8')
}

export function digestOf(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex')
}

export function refOf<X>(value: X): Ref<X> {
  const text = canonical(value)
  return {
    digest: createHash('sha256').update(text).digest('hex'),
    size: Buffer.byteLength(text, 'utf8'),
  }
}

const CONTENT_KEYS: ReadonlySet<string> = new Set(['role', 'content', 'messages', 'system'])

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
      return `step/${fact.step}#${fact.batch.id}`
    case 'request.adopted':
      return `request/${fact.step}/${fact.attempt}`
    case 'intent.voided':
      if (fact.intent === 'tool') return `voided/${fact.action}`
      return `voided/${fact.step}/${fact.attempt}`
    case 'call.intended':
      return `call/${fact.action}`
    case 'result.received':
      if (fact.result.delivery === 'account') return `account/${fact.delivery}`
      if (fact.result.delivery === 'placeholder') return `placeholder/${fact.consumption}`
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
    case 'control.stage':
      return `control/${fact.control}/${fact.stage}`
    case 'control.rejected':
      return `rejected/${fact.control}/${fact.audit.record}`
    case 'wait.entered':
      return `wait/${fact.step}/${fact.waits.digest}`
    case 'target.bound':
      return `target/${fact.reference}/${fact.pending.digest}`
    case 'finish.candidate':
      return `candidate/${fact.candidate}`
    case 'finish.proved':
      return `proved/${fact.route.record}`
    case 'finish.obligation':
      return `obligation/${fact.id}/${fact.item?.digest ?? 'gone'}`
    case 'finish.obligations':
      return `obligations/${fact.candidate}/${fact.list}`
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
    case 'material.preserved':
      return `material/${fact.source.record}`
    case 'op.excluded':
      return `excluded/${fact.operation}`
    case 'fence.started':
      return `fence/${fact.operation}`
    case 'cursor.moved':
      return `cursor/${fact.step}/${digestOf(fact.members)}`
  }
}

export function batchBytes(batch: Batch): number {
  return batch.facts.reduce((sum, fact) => sum + bytesOf(fact), BATCH_OVERHEAD_BYTES)
}

type Scope = Readonly<{ tenant: string; session: string }>

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
  'delivered',
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
