import { describe, expect, it } from 'vitest'
import type { DispatchRecord, ModelFault } from '@omne-harness/model-contract'
import type { ModelRetryPolicy } from '@omne-harness/model-contract/provider'
import {
  NO_RESEND_RETRY_POLICY,
  createDefaultRetryPolicy,
  createNoResendRetryPolicy,
  routeRetryPolicies,
  verifyRetryDecision,
} from '../src/retry-policy.ts'
import { createManualModelClock } from '../src/testing/clock.ts'
import { fixture, op } from './memory-fixture.ts'

const NOW = '2026-10-19T00:00:00Z'
const f = fixture()
type Principal = typeof f.principal
type Decide = Parameters<ModelRetryPolicy<Principal>['decide']>[0]
const request = f.admit.request
const first = request.suppliers[0]
const second = { ...first, model: 'second-model' }
const third = { ...first, model: 'third-model' }
const fault503: ModelFault = {
  cause: 'upstream-unavailable',
  diagnostic: 'http-503',
  upstreamStatus: '503',
}
const position = {
  operation: op('position'),
  dispatch: 'mdisp_one' as Decide['position']['dispatch'],
  policy: request.retryPolicy,
  consumer: { owner: 'policy', work: f.admit.call, position: 'mdisp_one', purpose: 'model-retry' },
}
const dispatch = (index: number) => ({ dispatch: `mdisp_${index}` }) as unknown as DispatchRecord

function policy(overrides: Partial<Parameters<typeof createDefaultRetryPolicy>[0]> = {}) {
  return createDefaultRetryPolicy<Principal>({
    adoption: request.retryPolicy,
    policy: { maxAttempts: 3, maxElapsedMs: 60_000, delaysMs: [1000, 5000], jitter: 0 },
    replayResend: { max: 1 },
    clock: createManualModelClock(NOW, 4).clock,
    random: () => 0,
    ...overrides,
  })
}
function ask(overrides: Partial<Decide> = {}, sent = 1): Decide {
  return {
    principal: f.principal,
    tenant: f.tenant,
    call: f.admit.call,
    position,
    initiator: { owner: 'tests', subject: 'actor', revision: '1' },
    request,
    dispatches: Array.from({ length: sent }, (_, index) => dispatch(index)),
    failure: fault503,
    ...overrides,
  }
}
async function decisionOf(made: ModelRetryPolicy<Principal>, input: Decide) {
  const answer = await made.decide(input)
  if (!('ok' in answer) || answer.ok.kind !== 'decided') throw new Error(JSON.stringify(answer))
  return answer.ok
}

describe('the default retry policy', () => {
  it('without fallback: sends to the original supplier again after the first delay', async () => {
    const decided = await decisionOf(policy(), ask())
    expect(decided.position).toEqual(position)
    expect(decided.decision).toEqual({
      kind: 'retry',
      supplier: first,
      notBefore: '2026-10-19T00:00:01.000Z',
      basis: request.retryPolicy,
    })
  })

  it('without fallback: stops after the second dispatch, whatever the configured attempts', async () => {
    const decided = await decisionOf(policy(), ask({}, 2))
    expect(decided.decision).toEqual({ kind: 'stop', fault: fault503 })
  })

  it('with fallback: goes to the next supplier in the declared order, each at most once', async () => {
    const fallback = {
      ...request,
      fallback: true,
      suppliers: [first, second, third],
    } as Decide['request']
    const made = policy()
    expect((await decisionOf(made, ask({ request: fallback }, 1))).decision).toMatchObject({
      kind: 'retry',
      supplier: second,
      notBefore: '2026-10-19T00:00:01.000Z',
    })
    expect((await decisionOf(made, ask({ request: fallback }, 2))).decision).toMatchObject({
      kind: 'retry',
      supplier: third,
      notBefore: '2026-10-19T00:00:05.000Z',
    })
    expect((await decisionOf(made, ask({ request: fallback }, 3))).decision).toEqual({
      kind: 'stop',
      fault: fault503,
    })
  })

  it('stops when the configured attempts are used up before the suppliers are', async () => {
    const fallback = {
      ...request,
      fallback: true,
      suppliers: [first, second, third],
    } as Decide['request']
    const made = policy({
      policy: { maxAttempts: 2, maxElapsedMs: 60_000, delaysMs: [1000], jitter: 0 },
    })
    expect((await decisionOf(made, ask({ request: fallback }, 2))).decision).toEqual({
      kind: 'stop',
      fault: fault503,
    })
  })

  it('stops when the delay is longer than the configured total time', async () => {
    const made = policy({
      policy: { maxAttempts: 3, maxElapsedMs: 500, delaysMs: [1000], jitter: 0 },
    })
    expect((await decisionOf(made, ask())).decision).toEqual({ kind: 'stop', fault: fault503 })
  })

  it.each(['stream-lost', 'runtime-lost'] as const)(
    'sends again for the transient cause %s',
    async cause => {
      const failure = { ...fault503, cause }
      expect((await decisionOf(policy(), ask({ failure }))).decision.kind).toBe('retry')
    },
  )

  it.each(['upstream-protocol', 'unclassified', 'input-rejected', 'credential'] as const)(
    'stops with the original fault for the cause %s',
    async cause => {
      const failure = { ...fault503, cause } as ModelFault
      expect((await decisionOf(policy(), ask({ failure }))).decision).toEqual({
        kind: 'stop',
        fault: failure,
      })
    },
  )

  it('applies the jitter of the configuration to the delay', async () => {
    const made = policy({
      policy: { maxAttempts: 3, maxElapsedMs: 60_000, delaysMs: [1000], jitter: 0.5 },
      random: () => 0.5,
    })
    expect((await decisionOf(made, ask())).decision).toMatchObject({
      notBefore: '2026-10-19T00:00:00.750Z',
    })
  })

  it('answers unavailable for a position that names another policy', async () => {
    const other = { ...position, policy: { ...request.retryPolicy, name: 'another/retry' } }
    expect(await policy().decide(ask({ position: other }))).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'model-retry-policy',
        diagnostic: 'policy-not-provided',
      },
    })
  })

  it('does not keep decisions: inspect answers unavailable', async () => {
    expect(await policy().inspect({ ...f.admit, position })).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'model-retry-policy',
        diagnostic: 'decision-kept-in-call-record',
      },
    })
  })
})

describe('the evidence of a decision of the default policy', () => {
  it('is verified for the position and the decision it was made for, and for nothing else', async () => {
    const decided = await decisionOf(policy(), ask())
    const given = { ...decided, request }
    expect(verifyRetryDecision(given)).toEqual({ ok: decided.source })
    const refused = { failure: { kind: 'invalid', field: 'source', reason: 'untrusted' } }
    expect(verifyRetryDecision({ ...given, decision: { kind: 'stop', fault: fault503 } })).toEqual(
      refused,
    )
    expect(
      verifyRetryDecision({ ...given, position: { ...position, operation: op('other') } }),
    ).toEqual(refused)
    expect(
      verifyRetryDecision({ ...given, source: { ...decided.source, digest: '0'.repeat(64) } }),
    ).toEqual(refused)
    expect(
      verifyRetryDecision({
        ...given,
        request: { ...request, retryPolicy: { ...request.retryPolicy, name: 'another/retry' } },
      }),
    ).toEqual(refused)
  })
})

// T2: the policy at a failure before content, by whether the dispatch carried reasoning state and
// whether the supplier refused it for that state.
describe('the default retry policy after a refusal of reasoning state', () => {
  const refused: ModelFault = {
    cause: 'replay-rejected',
    replayCarried: true,
    diagnostic: 'replay-signature',
    upstreamStatus: '400',
  }
  const failed = (supplier = first, withoutReplay?: 'resend' | 'later') =>
    ({
      dispatch: position.dispatch,
      supplier,
      ...(withoutReplay === undefined ? {} : { withoutReplay }),
    }) as unknown as DispatchRecord
  const earlier = (withoutReplay?: 'resend' | 'later') =>
    ({
      dispatch: 'mdisp_earlier',
      supplier: first,
      ...(withoutReplay === undefined ? {} : { withoutReplay }),
    }) as unknown as DispatchRecord
  const resending = (max: number) => policy({ replayResend: { max } })

  it('row 1: carried and refused for it, within the bound: sends again to that supplier at once', async () => {
    const decided = await decisionOf(
      resending(1),
      ask({ failure: refused, dispatches: [failed(second)] }),
    )
    expect(decided.decision).toEqual({ kind: 'resend-without-replay', supplier: second })
    const later = await decisionOf(
      resending(1),
      ask({ failure: refused, dispatches: [earlier(), failed(third)] }),
    )
    expect(later.decision).toEqual({ kind: 'resend-without-replay', supplier: third })
  })

  it('row 2: carried and refused for it, with the bound spent: stops with the refusal', async () => {
    const spent = await decisionOf(
      resending(1),
      ask({ failure: refused, dispatches: [earlier(), earlier('resend'), failed(first, 'later')] }),
    )
    expect(spent.decision).toEqual({ kind: 'stop', fault: refused })
    const none = await decisionOf(resending(0), ask({ failure: refused, dispatches: [failed()] }))
    expect(none.decision).toEqual({ kind: 'stop', fault: refused })
  })

  it('rows 3 and 5: any other failure follows the ordinary rules, carried or not', async () => {
    for (const failure of [{ ...fault503, replayCarried: true } as const, fault503]) {
      const decided = await decisionOf(resending(1), ask({ failure, dispatches: [failed()] }))
      expect(decided.decision).toMatchObject({ kind: 'retry', supplier: first })
    }
  })

  it('row 4: a refusal of state that was not carried reaches the policy as an invalid request, and stops', async () => {
    const invalid: ModelFault = {
      cause: 'input-rejected',
      diagnostic: 'replay-not-carried',
      upstreamStatus: '400',
    }
    const decided = await decisionOf(
      resending(1),
      ask({ failure: invalid, dispatches: [failed()] }),
    )
    expect(decided.decision).toEqual({ kind: 'stop', fault: invalid })
  })

  it('does not count the resend against the ordinary retries', async () => {
    const decided = await decisionOf(
      resending(1),
      ask({ dispatches: [earlier(), failed(first, 'resend')] }),
    )
    expect(decided.decision).toMatchObject({ kind: 'retry', supplier: first })
    const spent = await decisionOf(
      resending(1),
      ask({ dispatches: [earlier(), earlier('resend'), failed(first, 'later')] }),
    )
    expect(spent.decision).toEqual({ kind: 'stop', fault: fault503 })
  })
})

describe('the policy of a call that is sent once', () => {
  const once = NO_RESEND_RETRY_POLICY
  const named = { ...position, policy: once }

  it('stops on the first dispatch, a transient failure included, and its decision verifies', async () => {
    const made = createNoResendRetryPolicy<Principal>()
    const decided = await decisionOf(made, ask({ position: named }))
    expect(decided.decision).toEqual({ kind: 'stop', fault: fault503 })
    expect(
      verifyRetryDecision({ ...decided, request: { retryPolicy: once } as Decide['request'] }),
    ).toEqual({ ok: decided.source })
  })

  it('decides no position that names another policy', async () => {
    const made = createNoResendRetryPolicy<Principal>()
    expect(await made.decide(ask())).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: 'policy-not-provided' },
    })
  })
})

describe('several policies as one', () => {
  const once = NO_RESEND_RETRY_POLICY
  const routed = routeRetryPolicies<Principal>([
    { adoption: request.retryPolicy, policy: policy() },
    { adoption: once, policy: createNoResendRetryPolicy<Principal>() },
  ])

  it('a position is decided by the policy it names', async () => {
    expect((await decisionOf(routed, ask())).decision.kind).toBe('retry')
    const named = { ...position, policy: once }
    expect((await decisionOf(routed, ask({ position: named }))).decision.kind).toBe('stop')
  })

  it('a position that names none of them is decided by none, and inspected by none', async () => {
    const other = { ...position, policy: { ...once, name: 'another' } }
    const failure = { kind: 'unavailable', diagnostic: 'policy-not-provided' }
    expect(await routed.decide(ask({ position: other }))).toMatchObject({ failure })
    const { principal, tenant, call } = ask()
    expect(await routed.inspect({ principal, tenant, call, position: other })).toMatchObject({
      failure,
    })
  })
})
