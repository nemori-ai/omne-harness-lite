import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { judgeModelCallSemanticDigest } from '@omne-harness-lite/messages'
import type { PendingModelResponse } from '@omne-harness-lite/model-response'
import { attemptFromWitness } from './acknowledged-view.ts'
import { modelLogJsonEqual } from './log-codec-key.ts'
import type { AcknowledgedCallFacts } from './reference-types.ts'
import type { SettleReplyInput, SettleReplyResult } from './service-types.ts'

const malformed = Object.freeze({ invalidInput: { reason: 'malformed' } } as const)

/**
 * RT12 S-99 ③④⑥⑦ for a call whose model-side copy may already be released. A durable final
 * decides by the original same/different disposition rule without any full value. Without a
 * final the caller's own retained Pending is required and is checked, never trusted: MR11
 * shape (by the caller), original identity, the MS8 result-role digest and the minimal
 * accounting witness. `validated` means only that these checks passed; the new final write is
 * a separate responsibility (S-99⑧).
 */
export function judgeAcknowledgedSettlement(
  request: SettleReplyInput,
  retainedResult: PendingModelResponse | undefined,
  facts: AcknowledgedCallFacts,
): SettleReplyResult | { readonly validated: PendingModelResponse } {
  const record = facts.record
  const state = facts.terminalState === 'interrupted' ? 'interrupted' : 'complete'
  const target = record.target
  const decided =
    target.kind === 'response'
      ? facts.attempts.find(attempt => attempt.response === target.response)
      : facts.attempts.at(-1)
  if (decided === undefined) return { wrongPhase: { phase: facts.terminalState } }
  if (decided.disposition === 'final') {
    // S-99⑦: the same committed disposition recognizes the original final.
    return decided.replyDisposition !== undefined &&
      modelLogJsonEqual(decided.replyDisposition, request.disposition)
      ? { callId: request.callId, state }
      : { alreadyEnded: true }
  }
  if (retainedResult === undefined) return { wrongPhase: { phase: facts.terminalState } }
  const witness = record.accountingWitness
  const digest = record.retainedResultDigest
  if (witness === undefined || digest === undefined) return malformed
  const expected = attemptFromWitness(witness)
  const origin = witness.origin
  if (
    retainedResult.id !== decided.response ||
    retainedResult.call.callId !== request.callId ||
    ExactDecimal.from(retainedResult.dispatch).compare(ExactDecimal.from(decided.dispatch)) !== 0 ||
    retainedResult.call.runId !== origin.run ||
    (retainedResult.attemptId === undefined) !== (origin.attempt === undefined) ||
    (retainedResult.attemptId !== undefined &&
      origin.attempt !== undefined &&
      ExactDecimal.from(retainedResult.attemptId).compare(ExactDecimal.from(origin.attempt)) !==
        0) ||
    !(
      'ok' in
      judgeModelCallSemanticDigest(
        'model-call-retained-result-semantic-sha256/v1',
        retainedResult,
        digest,
      )
    )
  )
    return malformed
  // The digest covers the whole Pending; the witness is checked field by field as well so a
  // contradiction between the two fixed ACK facts cannot be hidden.
  const smallFacts = {
    usage: retainedResult.usage,
    cost: retainedResult.cost,
    credentialScope: retainedResult.route.credentialScope,
    provider: retainedResult.route.provider,
    upstreamRequestId: retainedResult.route.upstreamRequestId,
    timing: retainedResult.timing,
    outcome: retainedResult.outcome,
    initiator: retainedResult.initiator,
  }
  const witnessed = {
    usage: expected.usage,
    cost: expected.cost,
    credentialScope: expected.credentialScope,
    provider: expected.provider,
    upstreamRequestId: expected.upstreamRequestId,
    timing: expected.timing,
    outcome: expected.outcome,
    initiator: expected.initiator,
  }
  if (!modelLogJsonEqual(smallFacts, witnessed)) return malformed
  return { validated: retainedResult }
}
