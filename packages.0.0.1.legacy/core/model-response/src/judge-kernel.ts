import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { isJsonNumber, type JsonObject, type JsonValue } from '@omne-harness-lite/content-blocks'
import { isObject, snapshot, equal } from './json.ts'
import { calibrationRelationsValid } from './input-calibration.ts'
import type { ModelResponseJudgment, ModelResponseRejection } from './types.ts'

export interface JudgmentSchema {
  readonly outcomes: readonly string[]
  readonly causes: readonly string[]
  readonly membersValid: (value: JsonValue) => boolean
  readonly responseValid: (value: JsonValue) => boolean
  readonly pending?: true
}

function rejected(value: ModelResponseRejection): ModelResponseJudgment {
  return Object.freeze({ rejected: value })
}
const zero = ExactDecimal.from(0)
const one = ExactDecimal.from(1)

/** Already shape-checked numeric members cross the exact amount boundary before comparison. */
function amountsValid(value: JsonObject): boolean {
  for (const member of ['usage', 'cost']) {
    const amounts = value[member]
    if (!isObject(amounts)) return false
    for (const [key, amount] of Object.entries(amounts)) {
      if (key === 'source' || amount === 'unknown') continue
      if (!isJsonNumber(amount)) return false
      const exact = ExactDecimal.from(amount)
      if (exact.compare(zero) < 0 || (member === 'usage' && !exact.isInteger)) return false
    }
  }
  return true
}

function readDiscriminators(
  copied: JsonObject,
  schema: JudgmentSchema,
):
  | { readonly rejected: ModelResponseRejection }
  | { readonly outcome: JsonValue | undefined; readonly cause: JsonValue | undefined } {
  const outcome = copied.outcome
  if (typeof outcome === 'string' && !schema.outcomes.includes(outcome))
    return { rejected: 'outcome_unknown' }
  const dispatch = copied.dispatch
  if (isJsonNumber(dispatch)) {
    const exact = ExactDecimal.from(dispatch)
    if (exact.isInteger && exact.compare(one) < 0) return { rejected: 'dispatch_zero' }
  }
  const failure = copied.failure
  const cause = isObject(failure) ? failure.cause : undefined
  if (typeof cause === 'string' && !schema.causes.includes(cause))
    return { rejected: 'cause_unknown' }
  return { outcome, cause }
}

function pendingShapeInvalid(
  copied: JsonObject,
  outcome: JsonValue | undefined,
  schema: JudgmentSchema,
): boolean {
  return !!(
    schema.pending &&
    (outcome === 'failed' ||
      !Object.hasOwn(copied, 'reply') ||
      Object.hasOwn(copied, 'failure') ||
      Object.hasOwn(copied, 'delivered'))
  )
}

function replyPresenceRejection(
  outcome: JsonValue | undefined,
  reply: boolean,
  delivered: boolean,
): ModelResponseRejection | undefined {
  if ((outcome === 'complete' || outcome === 'truncated') && !reply) return 'reply_missing'
  if (outcome === 'failed' && reply) return 'reply_on_failure'
  if (reply && delivered) return 'reply_and_delivered'
  return undefined
}

function failurePresenceRejection(
  outcome: JsonValue | undefined,
  hasFailure: boolean,
): ModelResponseRejection | undefined {
  if (outcome === 'failed' && !hasFailure) return 'failure_missing'
  if (outcome === 'interrupted' && hasFailure) return 'failure_on_interrupted'
  if ((outcome === 'complete' || outcome === 'truncated') && hasFailure) return 'failure_on_success'
  return undefined
}

function replyEndingMatches(
  outcome: JsonValue | undefined,
  ending: JsonValue | undefined,
  reply: boolean,
): boolean {
  return !(
    reply &&
    ((outcome === 'complete' && ending !== 'complete') ||
      (outcome === 'truncated' && ending !== 'truncated_at_limit') ||
      (outcome === 'interrupted' && ending !== 'interrupted_by_user'))
  )
}

function firstTokenConsistent(
  outcome: JsonValue | undefined,
  cause: JsonValue | undefined,
  reply: boolean,
  delivered: boolean,
  firstToken: boolean,
): boolean {
  return !(
    (cause === 'interrupted_mid_reply' && !firstToken) ||
    (outcome === 'failed' && firstToken && (cause !== 'interrupted_mid_reply' || !delivered)) ||
    ((reply || delivered) && !firstToken)
  )
}

function crossMemberRejection(
  copied: JsonObject,
  outcome: JsonValue | undefined,
  cause: JsonValue | undefined,
): ModelResponseRejection | undefined {
  const reply = Object.hasOwn(copied, 'reply')
  const delivered = Object.hasOwn(copied, 'delivered')
  const hasFailure = Object.hasOwn(copied, 'failure')
  const replyRejection = replyPresenceRejection(outcome, reply, delivered)
  if (replyRejection !== undefined) return replyRejection
  const failureRejection = failurePresenceRejection(outcome, hasFailure)
  if (failureRejection !== undefined) return failureRejection
  const ending = isObject(copied.reply) ? copied.reply.ending : undefined
  if (!replyEndingMatches(outcome, ending, reply)) return 'reply_ending_mismatch'
  const firstToken = isObject(copied.timing) && Object.hasOwn(copied.timing, 'firstTokenAt')
  if (!firstTokenConsistent(outcome, cause, reply, delivered, firstToken))
    return 'first_token_inconsistent'
  if (!bindingValid(copied)) return 'malformed'
  if (!calibrationRelationsValid(copied)) return 'malformed'
  return undefined
}

/** S-27 fixed order. Shape failures are not reconstructed from validator errors. */
export function judgeModelResponseWithSchema(
  value: unknown,
  schema: JudgmentSchema,
): ModelResponseJudgment {
  const copied = snapshot(value)
  if (!isObject(copied)) return rejected('malformed')
  const discriminators = readDiscriminators(copied, schema)
  if ('rejected' in discriminators) return rejected(discriminators.rejected)
  const { outcome, cause } = discriminators
  if (pendingShapeInvalid(copied, outcome, schema)) return rejected('malformed')
  if (!schema.membersValid(copied) || !amountsValid(copied)) return rejected('malformed')
  const relationshipRejection = crossMemberRejection(copied, outcome, cause)
  if (relationshipRejection !== undefined) return rejected(relationshipRejection)
  if (!schema.responseValid(copied)) return rejected('malformed')
  return Object.freeze({ ok: true })
}

function bindingValid(value: JsonObject): boolean {
  const route = value.route
  if (
    !isObject(route) ||
    !isObject(route.profileSnapshot) ||
    !isObject(route.adaptation) ||
    !isObject(route.adaptation.definition) ||
    !isObject(route.profile)
  )
    return false
  const captured = route.profileSnapshot.adaptation
  return (
    captured !== undefined &&
    equal(route.adaptation, captured) &&
    route.adaptation.definition.modelId === route.profile.routeName
  )
}
