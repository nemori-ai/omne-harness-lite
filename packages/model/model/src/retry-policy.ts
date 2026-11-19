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

/** How many times a call may be sent again without its reasoning state after a refusal of it. */
export type ReplayResend = Readonly<{ max: number }>

// T2: a refusal of the reasoning state the dispatch carried is answered by sending to the same
// supplier at once without any, within its own bound and outside the ordinary retries.
function resendOrStop<P>(input: Decide<P>, bound: ReplayResend, stop: RetryDecision) {
  const resends = input.dispatches.filter(d => d.withoutReplay === 'resend').length
  const refused = input.dispatches.find(d => d.dispatch === input.position.dispatch)
  if (resends >= bound.max || refused === undefined) return stop
  return { kind: 'resend-without-replay', supplier: refused.supplier } satisfies RetryDecision
}

function decisionOf<P>(
  input: Decide<P>,
  options: Pick<DefaultRetryPolicyOptions, 'policy' | 'replayResend' | 'random'>,
  now: string,
): RetryDecision {
  const { request, dispatches, failure } = input
  const stop: RetryDecision = { kind: 'stop', fault: failure }
  if (failure.cause === 'replay-rejected') return resendOrStop(input, options.replayResend, stop)
  const sent = dispatches.filter(d => d.withoutReplay !== 'resend').length
  const supplier = request.fallback ? request.suppliers[sent] : request.suppliers[0]
  if (
    !faultIsTransient(failure.cause) ||
    supplier === undefined ||
    (!request.fallback && sent >= 2)
  )
    return stop
  const next = decideRetry(options.policy, { failures: sent, elapsedMs: 0 }, options.random)
  if (next.kind === 'exhausted') return stop
  const notBefore = new Date(Date.parse(now) + next.delayMs).toISOString()
  return { kind: 'retry', supplier, notBefore, basis: request.retryPolicy } satisfies RetryDecision
}

type DefaultRetryPolicyOptions = Readonly<{
  adoption: Adoption
  policy: RetryPolicy
  replayResend: ReplayResend
  clock: Pick<ModelClock, 'now'>
  random: () => number
}>

// The default policy of the product: with fallback each allowed supplier at most once in the
// declared order, without it the original supplier once more after the delay.
export function createDefaultRetryPolicy<P>(
  options: DefaultRetryPolicyOptions,
): ModelRetryPolicy<P> {
  const provided = digest(options.adoption)
  return {
    async decide(input) {
      if (digest(input.position.policy) !== provided) return unavailable('policy-not-provided')
      const decision = decisionOf(input, options, options.clock.now())
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
