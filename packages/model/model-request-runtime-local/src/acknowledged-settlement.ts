import type { SettleReplyInput, SettleReplyResult } from '@omne-harness-lite/model-request-runtime'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { judgeModelCallSemanticDigest } from '@omne-harness-lite/messages'
import type { PendingModelResponse } from '@omne-harness-lite/model-response'
import { attemptFromWitness } from '@omne-harness-lite/model-request-runtime'
import { modelLogJsonEqual } from '@omne-harness-lite/model-request-runtime'
import type { AcknowledgedCallFacts } from '@omne-harness-lite/model-request-runtime'

const malformed = Object.freeze({ invalidInput: { reason: 'malformed' } } as const)

function matchesRetainedIdentity(
  retainedResult: PendingModelResponse,
  decided: AcknowledgedCallFacts['attempts'][number],
  request: SettleReplyInput,
  origin: NonNullable<AcknowledgedCallFacts['record']['accountingWitness']>['origin'],
): boolean {
  return !(
    retainedResult.id !== decided.response ||
    retainedResult.call.callId !== request.callId ||
    ExactDecimal.from(retainedResult.dispatch).compare(ExactDecimal.from(decided.dispatch)) !== 0 ||
    retainedResult.call.runId !== origin.run ||
    (retainedResult.attemptId === undefined) !== (origin.attempt === undefined) ||
    (retainedResult.attemptId !== undefined &&
      origin.attempt !== undefined &&
      ExactDecimal.from(retainedResult.attemptId).compare(ExactDecimal.from(origin.attempt)) !== 0)
  )
}
function retainedAccountingFacts(retainedResult: PendingModelResponse) {
  return {
    usage: retainedResult.usage,
    cost: retainedResult.cost,
    credentialScope: retainedResult.route.credentialScope,
    provider: retainedResult.route.provider,
    ...(retainedResult.route.upstreamRequestId === undefined
      ? {}
      : { upstreamRequestId: retainedResult.route.upstreamRequestId }),
    timing: retainedResult.timing,
    outcome: retainedResult.outcome,
    ...(retainedResult.outcome === 'interrupted' ? { initiator: retainedResult.initiator } : {}),
  }
}
function witnessedAccountingFacts(expected: ReturnType<typeof attemptFromWitness>) {
  return {
    usage: expected.usage,
    cost: expected.cost,
    credentialScope: expected.credentialScope,
    provider: expected.provider,
    ...(expected.upstreamRequestId === undefined
      ? {}
      : { upstreamRequestId: expected.upstreamRequestId }),
    timing: expected.timing,
    outcome: expected.outcome,
    ...(expected.outcome === 'interrupted' ? { initiator: expected.initiator } : {}),
  }
}

function recognizeFinal(
  decided: AcknowledgedCallFacts['attempts'][number],
  request: SettleReplyInput,
  state: 'interrupted' | 'complete',
): SettleReplyResult {
  return decided.replyDisposition !== undefined &&
    modelLogJsonEqual(decided.replyDisposition, request.disposition)
    ? { callId: request.callId, state }
    : { alreadyEnded: true }
}
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
    return recognizeFinal(decided, request, state)
  }
  if (retainedResult === undefined) return { wrongPhase: { phase: facts.terminalState } }
  const witness = record.accountingWitness
  const digest = record.retainedResultDigest
  if (witness === undefined || digest === undefined) return malformed
  const expected = attemptFromWitness(witness)
  const origin = witness.origin
  if (
    !matchesRetainedIdentity(retainedResult, decided, request, origin) ||
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
  // Absent members stay absent: strict JSON comparison has no `undefined` value.
  const smallFacts = retainedAccountingFacts(retainedResult)
  const witnessed = witnessedAccountingFacts(expected)
  if (!modelLogJsonEqual(smallFacts, witnessed)) return malformed
  return { validated: retainedResult }
}
