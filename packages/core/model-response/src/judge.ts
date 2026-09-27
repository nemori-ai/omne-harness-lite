import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { isJsonNumber, type JsonObject, type JsonValue } from '@omne-harness-lite/content-blocks'
import loopSchema from '@omne-harness-lite/loop-extension/schema/v3' with { type: 'json' }
import schema from '@omne-harness-lite/model-response/schema' with { type: 'json' }
import { isObject, snapshot } from './json.ts'
import { membersValid, responseValid } from './schema.ts'
import type { ModelResponseJudgment, ModelResponseRejection } from './types.ts'

function rejected(value: ModelResponseRejection): ModelResponseJudgment {
  return Object.freeze({ rejected: value })
}
const outcomes: readonly string[] = Object.freeze([...schema.$defs.ResponseOutcome.enum])
const causes: readonly string[] = Object.freeze([...loopSchema.$defs.FailureCause.enum])
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

/** S-27 fixed order. Shape failures are not reconstructed from validator errors. */
export function judgeModelResponse(value: unknown): ModelResponseJudgment {
  const copied = snapshot(value)
  if (!isObject(copied)) return rejected('malformed')
  const outcome = copied.outcome
  if (typeof outcome === 'string' && !outcomes.includes(outcome)) return rejected('outcome_unknown')
  const dispatch = copied.dispatch
  if (isJsonNumber(dispatch)) {
    const exact = ExactDecimal.from(dispatch)
    if (exact.isInteger && exact.compare(one) < 0) return rejected('dispatch_zero')
  }
  const failure = copied.failure
  const cause = isObject(failure) ? failure.cause : undefined
  if (typeof cause === 'string' && !causes.includes(cause)) return rejected('cause_unknown')
  if (!membersValid(copied) || !amountsValid(copied)) return rejected('malformed')

  const reply = Object.hasOwn(copied, 'reply')
  const delivered = Object.hasOwn(copied, 'delivered')
  const hasFailure = Object.hasOwn(copied, 'failure')
  if ((outcome === 'complete' || outcome === 'truncated') && !reply)
    return rejected('reply_missing')
  if (outcome === 'failed' && reply) return rejected('reply_on_failure')
  if (reply && delivered) return rejected('reply_and_delivered')
  if (outcome === 'failed' && !hasFailure) return rejected('failure_missing')
  if (outcome === 'interrupted' && hasFailure) return rejected('failure_on_interrupted')
  if ((outcome === 'complete' || outcome === 'truncated') && hasFailure)
    return rejected('failure_on_success')
  const ending = isObject(copied.reply) ? copied.reply.ending : undefined
  if (
    reply &&
    ((outcome === 'complete' && ending !== 'complete') ||
      (outcome === 'truncated' && ending !== 'truncated_at_limit') ||
      (outcome === 'interrupted' && ending !== 'interrupted_by_user'))
  )
    return rejected('reply_ending_mismatch')
  const firstToken = isObject(copied.timing) && Object.hasOwn(copied.timing, 'firstTokenAt')
  if (
    (cause === 'interrupted_mid_reply' && !firstToken) ||
    (outcome === 'failed' && firstToken && (cause !== 'interrupted_mid_reply' || !delivered)) ||
    ((reply || delivered) && !firstToken)
  )
    return rejected('first_token_inconsistent')
  if (!bindingValid(copied)) return rejected('malformed')
  if (!responseValid(copied)) return rejected('malformed')
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
function equal(a: JsonValue, b: JsonValue): boolean {
  if (isJsonNumber(a) && isJsonNumber(b))
    return ExactDecimal.from(a).compare(ExactDecimal.from(b)) === 0
  if (Array.isArray(a) && Array.isArray(b))
    return (
      a.length === b.length &&
      a.every((item, i) => {
        const other = b[i]
        return other !== undefined && equal(item, other)
      })
    )
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a)
    return (
      keys.length === Object.keys(b).length &&
      keys.every(key => {
        const one = a[key],
          two = b[key]
        return one !== undefined && two !== undefined && Object.hasOwn(b, key) && equal(one, two)
      })
    )
  }
  return a === b
}
