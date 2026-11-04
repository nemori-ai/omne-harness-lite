// The generic part of `decide : (View, Command) -> Answer | Batch | Rejection` (R2-D292): the cursor
// difference that `cursor.moved` carries, the rule that a command without a new fact appends no
// batch, and the batch builder that refuses a repeated fact. The judgement of each command stays
// with the command; this file only shapes what a judgement that passed writes.
import type { AgentCheckpoint, JournalCommitState } from '@omne-harness/agent-contract'
import { canonical } from '../testing/canonical.ts'
import {
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
    inputBatch: checkpoint.inputBatch,
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
    state: state.kind,
  }
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

export type BatchRefusal = Readonly<{ kind: 'repeated'; key: string }>

/**
 * Builds the batch of one command from the facts its judgement produced: a command with no fact
 * appends nothing (`null`, the no-new-fact rule of R2-D292 3.6); a fact whose key the view already
 * holds, or that repeats within the batch, is refused, because a fact is written once.
 */
export function batchOf(
  view: ExecutionView,
  envelope: BatchEnvelope,
  facts: readonly FactBody[],
  known: (view: ExecutionView, key: string) => boolean = keyKnown,
): Batch | BatchRefusal | null {
  if (facts.length === 0) return null
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
    default:
      return false
  }
}
