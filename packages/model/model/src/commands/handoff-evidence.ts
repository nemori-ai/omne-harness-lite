// The consumer owner's evidence of one ACK, read before the write fence (model-contract SPEC
// "ACK 的前提与效果"). The owner's adapter reads its own durable record of what it saved, which
// takes an await; the write fence of the commands does not allow one. So `handoff` first reads the
// call under the same checks the write makes, asks the adapter, and then the write keeps the answer
// only for the same adapter, call, consumer, result and evidence it was given for. Anything else
// that the write sees is `unavailable`, and the consumer repeats the ACK with the same operation.
// The adapter confirms a durable fact that only grows (the owner's saved record), so a
// confirmation read before the fence still holds when the write commits it.
import type { Outcome } from '@omne-harness/operation-result'
import {
  encodeModelInvocationRef,
  type AckInput,
  type DurableEvidence,
  type ModelFailure,
} from '@omne-harness/model-contract'
import type { ModelCommandCore } from './state.ts'
import type { CallDocument, HandoffEvidenceInput, ModelCommandsEvidence } from './types.ts'
import { canonical, checkedEvidence, unavailable } from './value.ts'

/** The adapter's answer for one ACK, with what it was asked about. */
export type HandoffProof = Readonly<{
  adapter: ModelCommandsEvidence
  asked: string
  outcome: Outcome<DurableEvidence, ModelFailure>
}>

/** What the adapter is asked for `input` on `call`; the principal is not part of the comparison. */
function askedOf(context: HandoffEvidenceInput): string {
  const { principal: _principal, ...rest } = context
  return canonical(rest)
}

/**
 * The adapter and the question for `input` on `call`, or null when the write refuses the ACK before
 * it reaches the adapter (the same checks, in the same order).
 */
export function handoffQuestion<P>(
  core: ModelCommandCore<P>,
  input: AckInput<P>,
  call: CallDocument,
): Readonly<{ adapter: ModelCommandsEvidence; context: HandoffEvidenceInput }> | null {
  if (call.state.phase !== 'settled' || input.result !== call.state.settlement.version) return null
  const source =
    input.evidence.kind === 'processed' ? input.evidence.completion : input.evidence.custody
  if (source.owner !== call.state.consumer.owner) return null
  const adapter = core.adapter(call)
  if ('kind' in adapter) return null
  const reference = encodeModelInvocationRef({
    tenant: input.tenant,
    call: input.call,
    admission: call.admission,
  })
  if ('failure' in reference) return null
  return {
    adapter,
    context: {
      tenant: input.tenant,
      call: input.call,
      consumer: structuredClone(call.state.consumer),
      execution: call.execution === null ? null : { ...call.execution },
      result: input.result,
      evidence: structuredClone(input.evidence),
      reference: reference.ok,
      principal: input.principal,
    },
  }
}

/** Reads the call and asks its owner's adapter, outside the fence. Null: the write decides alone. */
export async function readHandoffProof<P>(
  core: ModelCommandCore<P>,
  input: AckInput<P>,
): Promise<HandoffProof | null> {
  const seen = await core.runRead(input, () =>
    core.read(input, 'handoff', call => ({ ok: handoffQuestion(core, input, call) })),
  )
  if ('failure' in seen || seen.ok === null) return null
  const { adapter, context } = seen.ok
  return {
    adapter,
    asked: askedOf(context),
    outcome: checkedEvidence(await adapter.handoff(context)),
  }
}

/**
 * The evidence the write keeps for `input` on `call`: the proof read before the fence when it was
 * read for this very question, a failure of the adapter as it answered, and `unavailable` when the
 * call changed in between or nothing was read.
 */
export function provenHandoff<P>(
  core: ModelCommandCore<P>,
  input: AckInput<P>,
  call: CallDocument,
  proof: HandoffProof | null,
): Outcome<DurableEvidence, ModelFailure> {
  const question = handoffQuestion(core, input, call)
  if (
    proof === null ||
    question === null ||
    question.adapter !== proof.adapter ||
    askedOf(question.context) !== proof.asked
  )
    return { failure: unavailable('consumer-evidence', 'evidence-not-read-for-this-call') }
  return proof.outcome
}
