import loopSchema from '@omne-harness-lite/loop-extension/schema' with { type: 'json' }
import schema from '@omne-harness-lite/model-response/schema' with { type: 'json' }
import { judgeModelResponseWithSchema } from './judge-kernel.ts'
import { equal, isObject, snapshot } from './json.ts'
import { membersValid, pendingMembersValid, pendingResponseValid, responseValid } from './schema.ts'
import type { ModelResponseJudgment } from './types.ts'

const judgmentSchema = Object.freeze({
  outcomes: Object.freeze([...schema.$defs.ResponseOutcome.enum]),
  causes: Object.freeze([...loopSchema.$defs.FailureCause.enum]),
  membersValid,
  responseValid,
})

/** S-27 fixed order. Shape failures are not reconstructed from validator errors. */
export function judgeModelResponse(value: unknown): ModelResponseJudgment {
  return judgeModelResponseWithSchema(value, judgmentSchema)
}

/** S-39: judge complete pre-commit facts without inventing disposition or lateness. */
export function judgePendingModelResponse(value: unknown): ModelResponseJudgment {
  return judgeModelResponseWithSchema(value, {
    outcomes: judgmentSchema.outcomes,
    causes: judgmentSchema.causes,
    membersValid: pendingMembersValid,
    responseValid: pendingResponseValid,
    pending: true,
  })
}

/** S-47: final adds only disposition and lateness to the complete original Pending. */
export function judgeResponseFinalization(pending: unknown, final: unknown): ModelResponseJudgment {
  const original = snapshot(pending)
  const pendingJudgment = judgePendingModelResponse(original)
  if ('rejected' in pendingJudgment) return pendingJudgment

  // Do not inspect final (including its JSON boundary) until Pending fully succeeds.
  const finalized = snapshot(final)
  const finalJudgment = judgeModelResponse(finalized)
  if ('rejected' in finalJudgment) return finalJudgment
  if (!isObject(original) || !isObject(finalized))
    throw new Error('validated response is not an object')
  const { replyDisposition: _disposition, late: _late, ...facts } = finalized
  return equal(original, facts) ? finalJudgment : Object.freeze({ rejected: 'malformed' })
}
