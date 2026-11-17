import type {
  Access,
  Action,
  ActionBatch,
  ActionSlot,
  AgentExecutionId,
  AgentMaterials,
  Failure,
  Passage,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import type { Message } from '@omne-harness/message'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { guidanceOf } from './admission-chain.ts'
import { rewrittenCandidate } from './extension-positions.ts'
import { localFailure } from './node-failure.ts'
import {
  answeredCandidate,
  candidateDigest,
  deniedCandidate,
  deniedUnchecked,
  guidedCandidate,
  placeholderCandidate,
  toolCallAnswerOf,
  toolCallOf,
  toolResultCandidate,
  uncheckedCandidate,
  type ReceivedToolDelivery,
} from './tools.ts'

type Received<K extends 'result' | 'placeholder'> = Promise<
  Outcome<ReceivedToolDelivery<K> | null, Failure>
>

export type SlotCandidatesHost<P> = Readonly<{
  access: Access<P>
  execution: AgentExecutionId
  materials: Pick<AgentMaterials<P, ContentBlock>, 'read'>
  batch(): ActionBatch
  passages(): readonly Passage[]
  received<K extends 'result' | 'placeholder'>(action: Action, kinds: readonly K[]): Received<K>
}>

const defective = (diagnostic: string): Failure =>
  localFailure('invariant', {
    kind: 'unavailable',
    owner: '@omne-harness/agent#defect',
    diagnostic,
  })

/** The candidate message of a slot: computed from the received result, then rewritten by the calls that judged it. */
export function createSlotCandidates<P>(host: SlotCandidatesHost<P>) {
  const { access, execution } = host

  async function slotCandidate(
    action: Action,
    slot: ActionSlot,
  ): Promise<Outcome<Message, Failure>> {
    const computed = await computedCandidate(action, slot)
    if ('failure' in computed) return computed
    if (slot.candidateDigest === null || candidateDigest(computed.ok) !== slot.candidateDigest)
      return fail({
        kind: 'invalid',
        field: 'slot.candidateDigest',
        reason: 'the candidate computed again does not match the digest of the slot',
      })
    return computed
  }

  async function deniedSlotCandidate(action: Action): Promise<Outcome<Message, Failure>> {
    const answer = action.judgment.kind === 'denied' ? action.judgment.answer : undefined
    if (answer === undefined) {
      if (deniedUnchecked(execution, host.batch(), action))
        return succeed(uncheckedCandidate(execution, action))
      const words = guidanceOf(host.passages(), action.id)
      return succeed(
        words === null
          ? deniedCandidate(execution, action)
          : guidedCandidate(execution, action, words),
      )
    }
    const material = await host.materials.read({ ...access, source: answer })
    if ('failure' in material) return material
    const text = toolCallAnswerOf(material.ok)
    if (text === null)
      return fail({ kind: 'invalid', field: 'judgment.answer', reason: 'not a call answer' })
    return succeed(answeredCandidate(execution, action, text))
  }

  async function backgroundCandidate(action: Action): Promise<Outcome<Message, Failure>> {
    const received = await host.received(action, ['placeholder'] as const)
    if ('failure' in received) return received
    if (received.ok === null)
      return fail(defective('T2: a background slot without its received placeholder'))
    const call = toolCallOf(access, received.ok.pending)
    return succeed(placeholderCandidate(execution, action, call, received.ok.delivery.source))
  }

  async function computedCandidate(
    action: Action,
    slot: ActionSlot,
  ): Promise<Outcome<Message, Failure>> {
    const base = await baseCandidate(action, slot)
    if ('failure' in base) return base
    return succeed(rewrittenCandidate(base.ok, slot.each, host.passages()))
  }

  async function baseCandidate(
    action: Action,
    slot: ActionSlot,
  ): Promise<Outcome<Message, Failure>> {
    if (slot.kind === 'denied') return deniedSlotCandidate(action)
    if (slot.kind === 'background') return backgroundCandidate(action)
    if (slot.kind !== 'result') return fail(defective(`T2: no candidate of a ${slot.kind} slot`))
    const received = await host.received(action, ['result'] as const)
    if ('failure' in received) return received
    if (received.ok === null) return fail(defective('T2: a result slot without its received entry'))
    return succeed(toolResultCandidate(execution, action, received.ok.delivery.value.content))
  }

  return { slotCandidate, computedCandidate }
}
