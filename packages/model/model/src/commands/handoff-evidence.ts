import type { Outcome } from '@omne-harness/operation-result'
import {
  encodeModelInvocationRef,
  type AckInput,
  type DurableEvidence,
  type ModelFailure,
} from '@omne-harness/model-contract'
import type { ModelCommandCore } from './state.ts'
import type { CallDocument, HandoffEvidenceInput, ModelCommandsEvidence } from './types.ts'
import { canonical, checkedEvidence, invalid, unavailable } from './value.ts'

export type HandoffProof = Readonly<{
  adapter: ModelCommandsEvidence
  asked: string
  outcome: Outcome<DurableEvidence, ModelFailure>
}>

function askedOf(context: HandoffEvidenceInput): string {
  const { principal: _principal, ...rest } = context
  return canonical(rest)
}

export type HandoffQuestion = Readonly<{
  adapter: ModelCommandsEvidence
  context: HandoffEvidenceInput
}>

export function handoffQuestion<P>(
  core: ModelCommandCore<P>,
  input: AckInput<P>,
  call: CallDocument,
): Outcome<HandoffQuestion, ModelFailure> {
  if (call.state.phase !== 'settled') return { failure: { kind: 'not-settled' } }
  if (input.result !== call.state.settlement.version)
    return { failure: { kind: 'handoff-invalid', reason: 'result-version' } }
  const source =
    input.evidence.kind === 'processed' ? input.evidence.completion : input.evidence.custody
  if (source.owner !== call.state.consumer.owner)
    return { failure: { kind: 'handoff-invalid', reason: 'consumer-owner' } }
  const adapter = core.adapter(call)
  if ('kind' in adapter) return { failure: adapter }
  const reference = encodeModelInvocationRef({
    tenant: input.tenant,
    call: input.call,
    admission: call.admission,
  })
  if ('failure' in reference) return { failure: invalid('call', 'invocation-reference') }
  return {
    ok: {
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
    },
  }
}

export async function readHandoffProof<P>(
  core: ModelCommandCore<P>,
  input: AckInput<P>,
): Promise<HandoffProof | null> {
  const seen = await core.runRead(input, () =>
    core.read(input, 'handoff', call => handoffQuestion(core, input, call)),
  )
  if ('failure' in seen) return null
  const { adapter, context } = seen.ok
  return {
    adapter,
    asked: askedOf(context),
    outcome: checkedEvidence(await adapter.handoff(context)),
  }
}

export function provenHandoff(
  question: HandoffQuestion,
  proof: HandoffProof | null,
): Outcome<DurableEvidence, ModelFailure> {
  if (
    proof === null ||
    question.adapter !== proof.adapter ||
    askedOf(question.context) !== proof.asked
  )
    return { failure: unavailable('consumer-evidence', 'evidence-not-read-for-this-call') }
  return proof.outcome
}
