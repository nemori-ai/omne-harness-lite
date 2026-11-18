import {
  faultIsTransient,
  type Adoption,
  type DurableEvidence,
  type ModelFailure,
  type RetryDecision,
  type RetryPosition,
} from '@omne-harness/model-contract'
import type {
  FixedRequestHead,
  ModelClock,
  ModelRetryPolicy,
} from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import { decideRetry, type RetryPolicy } from '@omne-harness/retry'
import { digest } from './commands/value.ts'

const OWNER = 'model-retry-policy'
const unavailable = (diagnostic: string) =>
  ({ failure: { kind: 'unavailable', dependency: OWNER, diagnostic } }) as const

type Decide<P> = Parameters<ModelRetryPolicy<P>['decide']>[0]

function evidenceOf(position: RetryPosition, decision: RetryDecision): DurableEvidence {
  return {
    owner: OWNER,
    record: position.operation,
    revision: '1',
    digest: digest({ position, decision }),
  }
}

function decisionOf<P>(input: Decide<P>, policy: RetryPolicy, now: string, random: () => number) {
  const { request, dispatches, failure } = input
  const stop: RetryDecision = { kind: 'stop', fault: failure }
  const sent = dispatches.length
  const supplier = request.fallback ? request.suppliers[sent] : request.suppliers[0]
  if (
    !faultIsTransient(failure.cause) ||
    supplier === undefined ||
    (!request.fallback && sent >= 2)
  )
    return stop
  const next = decideRetry(policy, { failures: sent, elapsedMs: 0 }, random)
  if (next.kind === 'exhausted') return stop
  const notBefore = new Date(Date.parse(now) + next.delayMs).toISOString()
  return { kind: 'retry', supplier, notBefore, basis: request.retryPolicy } satisfies RetryDecision
}

// The default policy of the product: with fallback each allowed supplier at most once in the
// declared order, without it the original supplier once more after the delay.
export function createDefaultRetryPolicy<P>(
  options: Readonly<{
    adoption: Adoption
    policy: RetryPolicy
    clock: Pick<ModelClock, 'now'>
    random: () => number
  }>,
): ModelRetryPolicy<P> {
  const provided = digest(options.adoption)
  return {
    async decide(input) {
      if (digest(input.position.policy) !== provided) return unavailable('policy-not-provided')
      const decision = decisionOf(input, options.policy, options.clock.now(), options.random)
      const { position } = input
      return { ok: { kind: 'decided', position, decision, source: evidenceOf(position, decision) } }
    },
    inspect: async () => unavailable('decision-kept-in-call-record'),
  }
}

export function verifyRetryDecision(
  input: Readonly<{
    position: RetryPosition
    decision: RetryDecision
    source: DurableEvidence
    request: Pick<FixedRequestHead, 'retryPolicy'>
  }>,
): Outcome<DurableEvidence, ModelFailure> {
  const expected = evidenceOf(input.position, input.decision)
  const trusted =
    digest(input.source) === digest(expected) &&
    digest(input.position.policy) === digest(input.request.retryPolicy)
  return trusted
    ? { ok: input.source }
    : { failure: { kind: 'invalid', field: 'source', reason: 'untrusted' } }
}
