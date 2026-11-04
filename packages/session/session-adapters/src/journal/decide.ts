// The generic part of `decide : (View, Command) -> Answer | Batch | Rejection` (R2-D292): the cursor
// difference that `cursor.moved` carries, the rule that a command without a new fact appends no
// batch, and the batch builder that refuses a repeated fact. The judgement of each command stays
// with the command; this file only shapes what a judgement that passed writes.
import type {
  AgentCheckpoint,
  AgentOperationId,
  JournalCommitState,
} from '@omne-harness/agent-contract'
import { canonical } from '../testing/canonical.ts'
import {
  BATCH_MAX_FACTS,
  factKey,
  refOf,
  type Batch,
  type BatchEnvelope,
  type CursorMembers,
  type FactBody,
} from './facts.ts'
import type { ExecutionView } from './fold.ts'

/**
 * The cursor members of one commit: the small members of the checkpoint as they are, the members
 * that carry content as references, and the committed state kind. Every member is present, so a
 * difference against the folded cursor finds exactly the members that changed.
 */
export function cursorOf(checkpoint: AgentCheckpoint, state: JournalCommitState): CursorMembers {
  return {
    position: checkpoint.position,
    step: checkpoint.step,
    // The batch itself is the `step.begun` of its step; the cursor names it (R2-D292).
    inputBatch: checkpoint.inputBatch === null ? null : checkpoint.inputBatch.id,
    guard: checkpoint.guard === null ? null : refOf(checkpoint.guard),
    priorConditions: checkpoint.priorConditions,
    currentHandoff: checkpoint.currentHandoff,
    replyAdmissionRead:
      checkpoint.replyAdmissionRead.kind === 'unverified'
        ? { kind: 'unverified' }
        : { kind: 'verified', prefix: refOf(checkpoint.replyAdmissionRead.prefix) },
    compaction: checkpoint.compaction === null ? null : refOf(checkpoint.compaction),
    requestPreparation:
      checkpoint.requestPreparation === null ? null : refOf(checkpoint.requestPreparation),
    adoptedContext: checkpoint.adoptedContext,
    passages: refOf(checkpoint.passages),
    completedPassages: checkpoint.completedPassages,
    batch: checkpoint.batch === null ? null : refOf(checkpoint.batch),
    calls: refOf(checkpoint.calls),
    schema: checkpoint.schema,
    definition: checkpoint.definition,
    adoptedRequest:
      checkpoint.adoptedRequest === null || checkpoint.adoptedRequest === undefined
        ? null
        : refOf(checkpoint.adoptedRequest),
    state: state.kind,
  }
}

/** A content-addressed store of the values the facts refer to: the custody blocks. */
export type BlobStore = ReadonlyMap<string, unknown>

/** One block to put with a batch: its digest and the value. */
export type Blob = readonly [digest: string, value: unknown]

export const blobOf = (value: unknown): Blob => [refOf(value).digest, value]

/** The blocks a checkpoint's cursor refers to: every member that enters a fact as a reference. */
export function blobsOf(checkpoint: AgentCheckpoint): Blob[] {
  const out: Blob[] = [blobOf(checkpoint.passages), blobOf(checkpoint.calls)]
  if (checkpoint.guard !== null) out.push(blobOf(checkpoint.guard))
  if (checkpoint.replyAdmissionRead.kind === 'verified')
    out.push(blobOf(checkpoint.replyAdmissionRead.prefix))
  if (checkpoint.compaction !== null) out.push(blobOf(checkpoint.compaction))
  if (checkpoint.requestPreparation !== null) out.push(blobOf(checkpoint.requestPreparation))
  if (checkpoint.batch !== null) out.push(blobOf(checkpoint.batch))
  if (checkpoint.adoptedRequest !== null && checkpoint.adoptedRequest !== undefined)
    out.push(blobOf(checkpoint.adoptedRequest))
  return out
}

function held<T>(blobs: BlobStore, ref: Readonly<{ digest: string }>, what: string): T {
  if (!blobs.has(ref.digest))
    throw new TypeError(`the Journal holds no block for the ${what} the cursor refers to`)
  return structuredClone(blobs.get(ref.digest)) as T
}

/**
 * The checkpoint a complete folded view names: the inverse of `cursorOf`, reading the referred
 * members from the blocks. Two members are not in the cursor because facts of their own hold them
 * (R2-D292): `inputBatch` is the batch of the `step.begun` the cursor names, and `voided` lists the
 * `intent.voided` requests in adoption order, each with the action of its `call.intended`. A member
 * the cursor lacks, a block the store does not hold, a batch no `step.begun` holds, or a voided
 * request without its intended call is a defect of the writer that folded it, not a value to
 * invent: it throws.
 */
export function checkpointOf(
  view: Pick<ExecutionView, 'cursor' | 'steps' | 'requests' | 'intents'>,
  blobs: BlobStore,
): AgentCheckpoint {
  const { cursor } = view
  const need = <K extends keyof CursorMembers>(name: K): CursorMembers[K] => {
    if (!(name in cursor)) throw new TypeError(`the folded cursor has no member ${name}`)
    return cursor[name] as CursorMembers[K]
  }
  const taken = need('inputBatch')
  const inputBatch =
    taken === null ? null : (view.steps.find(item => item.batch.id === taken)?.batch ?? null)
  if (taken !== null && inputBatch === null)
    throw new TypeError(`the Journal holds no step.begun for the input batch ${taken}`)
  const voided = view.requests
    .filter(request => request.voided !== null)
    .map(request => {
      const intent = [...view.intents.values()].find(
        item => item.pending.kind === 'model' && item.pending.reference === request.reference,
      )
      if (intent === undefined)
        throw new TypeError(
          `the Journal holds no call.intended for the voided request ${request.reference}`,
        )
      return {
        step: request.step,
        action: intent.action,
        reference: request.reference,
        basis: request.voided!,
      }
    })
  const checkpoint: AgentCheckpoint = {
    schema: need('schema'),
    definition: need('definition'),
    step: need('step'),
    position: need('position'),
    calls: held(blobs, need('calls'), 'calls'),
    passages: held(blobs, need('passages'), 'passages'),
    batch: need('batch') === null ? null : held(blobs, need('batch')!, 'batch'),
    inputBatch: structuredClone(inputBatch),
    requestPreparation:
      need('requestPreparation') === null
        ? null
        : held(blobs, need('requestPreparation')!, 'requestPreparation'),
    compaction: need('compaction') === null ? null : held(blobs, need('compaction')!, 'compaction'),
    adoptedContext: need('adoptedContext'),
    guard: need('guard') === null ? null : held(blobs, need('guard')!, 'guard'),
    completedPassages: need('completedPassages'),
    priorConditions: need('priorConditions'),
    currentHandoff: need('currentHandoff'),
    replyAdmissionRead: (() => {
      const read = need('replyAdmissionRead')
      return read.kind === 'unverified'
        ? { kind: 'unverified' as const }
        : { kind: 'verified' as const, prefix: held(blobs, read.prefix, 'replyAdmissionRead') }
    })(),
    voided: structuredClone(voided),
  }
  const adopted = need('adoptedRequest')
  return adopted === null
    ? { ...checkpoint, adoptedRequest: null }
    : { ...checkpoint, adoptedRequest: held(blobs, adopted, 'adoptedRequest') }
}

/** The members of `after` whose canonical text differs from the folded cursor `before`. */
export function movedMembers(
  before: Readonly<Partial<CursorMembers>>,
  after: CursorMembers,
): Partial<CursorMembers> {
  const moved: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(after)) {
    const known = (before as Record<string, unknown>)[name]
    if (!(name in before) || canonical(known) !== canonical(value)) moved[name] = value
  }
  return moved as Partial<CursorMembers>
}

/** The `cursor.moved` fact of a commit, or null when no member moved. */
export function cursorMoved(
  view: ExecutionView,
  checkpoint: AgentCheckpoint,
  state: JournalCommitState,
): Extract<FactBody, { kind: 'cursor.moved' }> | null {
  const members = movedMembers(view.cursor, cursorOf(checkpoint, state))
  if (Object.keys(members).length === 0) return null
  return { kind: 'cursor.moved', step: checkpoint.step, members }
}

export type BatchRefusal =
  | Readonly<{ kind: 'repeated'; key: string }>
  /** More facts than one batch may carry (`BATCH_MAX_FACTS`). */
  | Readonly<{ kind: 'too-many'; facts: number; limit: number }>
  /** The operation was excluded earlier; its write is refused, not revived (R2-D307). */
  | Readonly<{ kind: 'excluded'; operation: AgentOperationId }>
  /** An `exec.opened` must travel with the `exec.attached` that names the Authority (R2-D307). */
  | Readonly<{ kind: 'incomplete'; reason: 'open-without-attachment' }>

/**
 * Builds the batch of one command from the facts its judgement produced. A command with no new
 * fact appends a batch of the envelope alone (R2-D307): it advances no revision, it is a small
 * constant in bytes, and it is what a retry and `query` recognize the operation by. A fact whose
 * key the view already holds, or that repeats within the batch, is refused, because a fact is
 * written once; an excluded operation is refused; an open without its attachment is refused.
 */
export function batchOf(
  view: ExecutionView,
  envelope: BatchEnvelope,
  facts: readonly FactBody[],
  known: (view: ExecutionView, key: string) => boolean = keyKnown,
): Batch | BatchRefusal {
  if (view.excluded.has(envelope.op)) return { kind: 'excluded', operation: envelope.op }
  if (facts.length > BATCH_MAX_FACTS)
    return { kind: 'too-many', facts: facts.length, limit: BATCH_MAX_FACTS }
  if (
    facts.some(fact => fact.kind === 'exec.opened') &&
    !facts.some(fact => fact.kind === 'exec.attached')
  )
    return { kind: 'incomplete', reason: 'open-without-attachment' }
  const keys = new Set<string>()
  for (const fact of facts) {
    const key = factKey(fact)
    if (keys.has(key) || known(view, key)) return { kind: 'repeated', key }
    keys.add(key)
  }
  return { execution: view.execution, envelope, facts }
}

/** Whether the view already holds a fact of `key`: the kinds whose key is unique per execution. */
export function keyKnown(view: ExecutionView, key: string): boolean {
  const [kind, ...rest] = key.split('/')
  const name = rest.join('/')
  switch (kind) {
    case 'exec':
      return view.opened !== null
    case 'attach':
      return view.attachments.some(item => item.authority.executionAttachment === name)
    case 'input':
      return view.inputs.some(item => item.input === name)
    case 'step':
      return view.steps.some(item => item.step === name)
    case 'call':
      return view.intents.has(name as never)
    case 'associated':
      return (
        view.intents.get(name as never)?.association !== null && view.intents.has(name as never)
      )
    case 'received':
      return view.results.get(name as never)?.received !== null && view.results.has(name as never)
    case 'reply':
      return view.admissions.some(item => String(item.sequence) === name)
    case 'batch':
      return view.batches.has(name as never)
    case 'candidate':
      return view.finish.candidates.some(item => item.candidate === name)
    case 'ended':
      return view.finish.ended !== null
    case 'ack':
      return view.acknowledged >= Number(name)
    case 'excluded':
      return view.excluded.has(name as never)
    case 'fence':
      return view.fences.some(item => item.operation === name)
    default:
      return false
  }
}
