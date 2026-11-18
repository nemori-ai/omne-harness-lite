import type {
  AgentCheckpoint,
  AgentOperationId,
  JournalCommitState,
  PendingCall,
  VoidedIntent,
} from '@omne-harness/agent-contract'
import { canonical } from '../testing/canonical.ts'
import {
  REVIVABLE_EXCLUSIONS,
  BATCH_MAX_FACTS,
  FACT_MAX_BYTES,
  bytesOf,
  factKey,
  refOf,
  type Batch,
  type BatchEnvelope,
  type CursorMembers,
  type FactBody,
  type ResultKey,
} from './facts.ts'
import { handoffKey, type ExecutionView } from './view.ts'

// The calls a checkpoint still waits on: its calls, those of its batch, those of its passages.
export function checkpointCalls(checkpoint: AgentCheckpoint): PendingCall[] {
  return [
    ...checkpoint.calls,
    ...(checkpoint.batch?.actions.flatMap(action => (action.call ? [action.call] : [])) ?? []),
    ...checkpoint.passages.flatMap(passage =>
      passage.operations.flatMap(operation =>
        'pending' in operation && operation.pending ? [operation.pending] : [],
      ),
    ),
  ]
}

export function cursorOf(checkpoint: AgentCheckpoint, state: JournalCommitState): CursorMembers {
  return {
    position: checkpoint.position,
    step: checkpoint.step,
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
    holds: heldBy(checkpoint),
  }
}

// Half a fact at most: the cursor's other members share it.
const HOLDS_MAX_BYTES = FACT_MAX_BYTES / 2

function heldBy(checkpoint: AgentCheckpoint): CursorMembers['holds'] {
  const holds = {
    actions: [
      ...checkpoint.calls.map(call => call.action),
      ...(checkpoint.batch?.actions.map(action => action.id) ?? []),
    ],
    consumptions: [
      ...checkpointCalls(checkpoint).map(call => call.consumption),
      ...(checkpoint.compaction === null ? [] : [checkpoint.compaction.consumption]),
    ],
    handoffs: (checkpoint.batch?.slots ?? []).flatMap(slot =>
      slot.handoff === null ? [] : [handoffKey(slot.handoff)],
    ),
    admissionsFrom:
      checkpoint.replyAdmissionRead.kind === 'verified'
        ? Number(checkpoint.replyAdmissionRead.prefix.sequence)
        : 0,
  }
  return bytesOf(holds) > HOLDS_MAX_BYTES ? null : holds
}

export type BlobStore = ReadonlyMap<string, unknown>

export type Blob = readonly [digest: string, value: unknown]

export const blobOf = (value: unknown): Blob => [refOf(value).digest, value]

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

export function checkpointOf(
  view: Pick<ExecutionView, 'cursor' | 'steps' | 'voided'>,
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
  const voided = view.voided.map((fact): VoidedIntent => {
    const { step, basis } = fact
    if (fact.intent === 'tool')
      return { kind: 'tool', step, action: fact.action, cause: fact.cause, basis }
    return {
      kind: 'model',
      step,
      action: fact.action,
      reference: fact.reference,
      cause: fact.cause,
      basis,
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
  | Readonly<{ kind: 'too-many'; facts: number; limit: number }>
  | Readonly<{ kind: 'excluded'; operation: AgentOperationId }>
  | Readonly<{ kind: 'incomplete'; reason: 'open-without-attachment' }>

export function batchOf(
  view: ExecutionView,
  envelope: BatchEnvelope,
  facts: readonly FactBody[],
  known: (view: ExecutionView, key: string) => boolean = keyKnown,
): Batch | BatchRefusal {
  const exclusion = view.excluded.get(envelope.op)
  if (exclusion !== undefined && !REVIVABLE_EXCLUSIONS.has(exclusion.reason))
    return { kind: 'excluded', operation: envelope.op }
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
      return view.steps.some(item => `${item.step}#${item.batch.id}` === name)
    case 'call':
      return view.intents.has(name as never)
    case 'received':
      return (view.results.get(name as ResultKey)?.received ?? null) !== null
    case 'placeholder':
      return view.placeholders.has(name as never)
    case 'reply':
      return view.admissions.some(item => String(item.sequence) === name)
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
