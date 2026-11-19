import { judgeMessage, judgePart } from '@omne-harness/message'
import { describe, expect, it } from 'vitest'
import type { FixedModelRequest, ModelFault, RetryDecision } from '@omne-harness/model-contract'
import type { ModelRetryPolicy, TransportFact } from '@omne-harness/model-contract/provider'
import { beginAttempt, initialAttempts, recordRetryDecision } from '../src/commands/attempts.ts'
import type { CallDocument } from '../src/commands/types.ts'
import { createDefaultRetryPolicy, verifyRetryDecision } from '../src/retry-policy.ts'
import { eventually, runtimeFixture } from './runtime-fixture.ts'
import { adoption, op, proof, request, unbox } from './memory-fixture.ts'
import { invocationReference } from './reference-input.ts'

type F = ReturnType<typeof runtimeFixture>
type Principal = F['principal']
type Decide = Parameters<ModelRetryPolicy<Principal>['decide']>[0]
type Answer = Awaited<ReturnType<ModelRetryPolicy<Principal>['decide']>>

const START = '2026-10-19T00:00:00Z'
const LATER = '2026-10-19T00:00:05Z'
const fault503: ModelFault = {
  cause: 'upstream-unavailable',
  upstreamStatus: '503',
  diagnostic: 'http-503',
}
const failed503: TransportFact = {
  kind: 'ended',
  termination: { kind: 'failed', fault: fault503 },
}
const text = (() => {
  const part = judgePart({
    kind: 'text',
    id: 'answer',
    text: 'kept',
    visibility: { toHuman: true, toModel: true },
  })
  if ('rejected' in part || part.ok.kind !== 'text') throw new Error('invalid text block')
  return part.ok
})()
const content: TransportFact[] = [
  { kind: 'block-open', index: '0', content: 'text', mode: 'append' },
  { kind: 'block-delta', index: '0', delta: 'kept' },
]
const answer: TransportFact[] = [
  ...content,
  { kind: 'block-seal', index: '0', block: text },
  { kind: 'ended', termination: { kind: 'completed', reason: 'stop' } },
]

function policyOf(decide: (input: Decide) => Answer | Promise<Answer>) {
  const asked: Decide[] = []
  const policy: ModelRetryPolicy<Principal> = {
    decide: async input => {
      asked.push(input)
      return decide(input)
    },
    inspect: async () => ({
      failure: { kind: 'unavailable', dependency: 'test-policy', diagnostic: 'not-used' },
    }),
  }
  return { policy, asked }
}
const decided = (input: Decide, decision: RetryDecision): Answer => ({
  ok: {
    kind: 'decided',
    position: input.position,
    decision,
    source: proof(input.position.operation, 'retry'),
  },
})
const again = (input: Decide, notBefore = START): Answer =>
  decided(input, {
    kind: 'retry',
    supplier: input.request.suppliers[0],
    notBefore,
    basis: input.request.retryPolicy,
  })

function world(
  decide: (input: Decide) => Answer | Promise<Answer>,
  options: { proven?: boolean; wrap?: Parameters<typeof runtimeFixture>[1] } = {},
) {
  const { policy, asked } = policyOf(decide)
  const f = runtimeFixture({}, options.wrap, undefined, undefined, policy)
  if (options.proven !== false) {
    const adapter = f.options.evidence[0]
    if (!adapter) throw new Error('missing evidence adapter')
    adapter.receive = input => ({
      ok: { window: input.window, batchDigest: input.batchDigest, paused: true, noPrefetch: true },
    })
  }
  return { f, asked }
}
async function run(f: F, facts: readonly TransportFact[]) {
  unbox(await f.provider.runtime.calls.admit(f.admit))
  await f.start(f.admit.call)
  f.channel(f.admit.call).push(facts)
  await eventually(() => f.results.has(f.admit.call))
  return f.results.get(f.admit.call)
}
async function state(f: F) {
  const found = unbox(
    await f.provider.runtime.calls.inspect({
      ...f.admit,
      reference: invocationReference({ ...f.admit, admission: f.admit.operation }),
    }),
  )
  if (found.kind !== 'found') throw new Error('missing accepted call')
  return found.state
}
async function termination(f: F) {
  const current = await state(f)
  if (current.phase !== 'settled') throw new Error(`the call is ${current.phase}`)
  return current.settlement.termination
}
const dispatches = async (f: F) => unbox(await f.provider.runtime.calls.dispatches(f.admit))
const starts = (f: F) => f.channel(f.admit.call).starts

describe('a dispatch that failed before any content reaches the retry policy', () => {
  it('a decision to stop settles the call with the fault of the decision', async () => {
    const { f, asked } = world(input => decided(input, { kind: 'stop', fault: input.failure }))
    try {
      expect(await run(f, [failed503])).toEqual({ ok: undefined })
      expect(await termination(f)).toEqual({ kind: 'failed', fault: fault503 })
      expect(asked).toHaveLength(1)
      expect(asked[0]).toMatchObject({ failure: fault503, dispatches: [{ send: 'started' }] })
      expect(starts(f)).toBe(1)
    } finally {
      await f.dispose()
    }
  })

  it.each([
    [
      'answers unavailable',
      'unavailable',
      (): Answer => ({
        failure: { kind: 'unavailable', dependency: 'policy', diagnostic: 'not-provided' },
      }),
    ],
    [
      'throws',
      'policy-threw',
      (): Answer => {
        throw new Error('the policy broke')
      },
    ],
    [
      'decides a supplier the request does not allow next',
      'decision-refused',
      (input: Decide): Answer =>
        decided(input, {
          kind: 'retry',
          supplier: { ...input.request.suppliers[0], model: 'another-model' },
          notBefore: START,
          basis: input.request.retryPolicy,
        }),
    ],
    [
      'decides a resend without reasoning state after a failure that refused none',
      'decision-refused',
      (input: Decide): Answer =>
        decided(input, { kind: 'resend-without-replay', supplier: input.request.suppliers[0] }),
    ],
  ])(
    'a policy that %s settles the call as policy-unavailable',
    async (_name, diagnostic, decide) => {
      const { f } = world(decide)
      try {
        expect(await run(f, [failed503])).toEqual({ ok: undefined })
        expect(await termination(f)).toEqual({
          kind: 'failed',
          fault: { cause: 'policy-unavailable', diagnostic, upstreamStatus: null },
        })
        expect(await dispatches(f)).toHaveLength(1)
        expect(starts(f)).toBe(1)
      } finally {
        await f.dispose()
      }
    },
  )

  it('a decision to send again sends once more in the same call, and both dispatches keep their facts', async () => {
    const { f, asked } = world(input => again(input))
    try {
      expect(await run(f, [failed503, ...answer])).toEqual({ ok: undefined })
      expect(await termination(f)).toEqual({ kind: 'completed', reason: 'stop' })
      const records = await dispatches(f)
      expect(records).toMatchObject([
        { send: 'started', firstContent: 'none-proven', terminal: failed503.termination },
        { send: 'started', firstContent: 'observed', terminal: { kind: 'completed' } },
      ])
      expect(asked).toHaveLength(1)
      expect(f.channel(f.admit.call)).toMatchObject({ starts: 2, closes: 2 })
    } finally {
      await f.dispose()
    }
  })

  it('a second failure asks the policy again with both dispatches', async () => {
    const { f, asked } = world(input =>
      input.dispatches.length === 1
        ? again(input)
        : decided(input, { kind: 'stop', fault: input.failure }),
    )
    try {
      expect(await run(f, [failed503, failed503])).toEqual({ ok: undefined })
      expect(await termination(f)).toEqual({ kind: 'failed', fault: fault503 })
      expect(asked.map(input => input.dispatches.length)).toEqual([1, 2])
      expect(starts(f)).toBe(2)
    } finally {
      await f.dispose()
    }
  })

  it('a decision for a later instant asks the host for a wake at that instant and sends when it has come', async () => {
    const { f } = world(input => again(input, LATER))
    try {
      expect(await run(f, [failed503, ...answer])).toEqual({ ok: undefined })
      expect((await state(f)).phase).toBe('retry-decision')
      expect(f.scheduled.at(-1)).toMatchObject({ call: f.admit.call, notBefore: LATER })
      expect(starts(f)).toBe(1)
      expect(await f.drive()).toEqual({ ok: undefined })
      expect(f.scheduled.filter(item => item.notBefore === LATER)).toHaveLength(2)
      expect(starts(f)).toBe(1)
      f.controls.clock.advanceTo(LATER)
      expect(await f.drive()).toEqual({ ok: undefined })
      expect(await termination(f)).toEqual({ kind: 'completed', reason: 'stop' })
      expect(starts(f)).toBe(2)
    } finally {
      await f.dispose()
    }
  })
})

describe('a stop request at the policy point', () => {
  it('after the position was taken: no further dispatch, and the failed dispatch settles the call', async () => {
    const { f } = world(input => ({ ok: { kind: 'pending', position: input.position } }))
    try {
      expect(await run(f, [failed503, ...answer])).toEqual({
        failure: {
          kind: 'unavailable',
          dependency: 'model-retry-policy',
          diagnostic: 'retry-decision-pending',
        },
      })
      expect((await state(f)).phase).toBe('retry-decision')
      unbox(await f.provider.runtime.calls.cancel({ ...f.admit, operation: op('stop') }))
      await f.drive()
      expect(await termination(f)).toEqual({ kind: 'failed', fault: fault503 })
      expect(starts(f)).toBe(1)
      expect(await dispatches(f)).toHaveLength(1)
    } finally {
      await f.dispose()
    }
  })

  it('after the decision to send again: no further dispatch, and the failed dispatch settles the call', async () => {
    const { f } = world(input => again(input, LATER))
    try {
      expect(await run(f, [failed503, ...answer])).toEqual({ ok: undefined })
      unbox(await f.provider.runtime.calls.cancel({ ...f.admit, operation: op('stop') }))
      f.controls.clock.advanceTo(LATER)
      await f.drive()
      expect(await termination(f)).toEqual({ kind: 'failed', fault: fault503 })
      expect(starts(f)).toBe(1)
      expect(await dispatches(f)).toHaveLength(1)
    } finally {
      await f.dispose()
    }
  })
})

describe('failures that do not reach the retry policy', () => {
  it.each([
    ['a failure after content', [...content, failed503], true],
    ['a failure whose first content is not proven absent', [failed503], false],
    [
      'an input over the limit of the supplier',
      [
        {
          kind: 'ended',
          termination: {
            kind: 'failed',
            fault: {
              cause: 'input-over-limit',
              diagnostic: 'too-long',
              upstreamStatus: '400',
              reported: { metric: null, limit: null, actual: null },
            },
          },
        } satisfies TransportFact,
      ],
      true,
    ],
  ] as const)(
    '%s settles with its own fault and the policy is not asked',
    async (_name, facts, proven) => {
      const { f, asked } = world(input => again(input), { proven })
      try {
        await run(f, facts)
        const ended = facts.at(-1)
        if (ended?.kind !== 'ended') throw new Error('fixture facts')
        expect(await termination(f)).toEqual(ended.termination)
        expect(asked).toHaveLength(0)
        expect(starts(f)).toBe(1)
      } finally {
        await f.dispose()
      }
    },
  )
})

describe('the write of the decision has an unknown answer', () => {
  it.each(['applied', 'not-applied'] as const)(
    'no dispatch while the answer is unknown (%s); one dispatch after the store answered',
    async effect => {
      let controls: F['controls'] | undefined
      let injected = false
      const { f } = world(input => again(input), {
        wrap: commands => ({
          ...commands,
          decideRetry: async input => {
            if (!injected) {
              injected = true
              controls?.commands.injectUnknown({
                tenant: input.tenant,
                call: input.call,
                operation: input.operation,
                method: 'decideRetry',
                effect,
              })
            }
            return commands.decideRetry(input)
          },
        }),
      })
      controls = f.controls
      try {
        const first = await run(f, [failed503, ...answer])
        expect(first).toMatchObject({ failure: { kind: 'commit-unknown' } })
        expect(await f.drive()).toMatchObject({ failure: { kind: 'commit-unknown' } })
        expect(starts(f)).toBe(1)
        const unknown = first as { failure: { kind: 'commit-unknown'; operation: string } }
        f.controls.commands.reveal({
          tenant: f.tenant,
          call: f.admit.call,
          operation: unknown.failure.operation as never,
          result: effect === 'applied' ? 'committed' : 'not-committed',
        })
        expect(await f.drive()).toEqual({ ok: undefined })
        expect(await termination(f)).toEqual({ kind: 'completed', reason: 'stop' })
        expect(starts(f)).toBe(2)
        expect(await dispatches(f)).toHaveLength(2)
      } finally {
        await f.dispose()
      }
    },
  )
})

describe('the retry stage keeps the call open when it cannot go on', () => {
  it.each(['loadRecovery', 'loadRequest', 'dispatches'] as const)(
    'a %s that fails at the policy point ends the drive with that failure; the next drive goes on',
    async method => {
      let armed = false
      let once = false
      const offline = {
        failure: { kind: 'unavailable', dependency: 'store', diagnostic: 'offline' },
      } as const
      const { f, asked } = world(input => again(input), {
        wrap: commands => ({
          ...commands,
          preserve: async input => {
            const saved = await commands.preserve(input)
            if (!once && input.facts.some(fact => fact.kind === 'ended')) armed = once = true
            return saved
          },
          [method]: async (input: never) => (armed ? offline : commands[method](input)),
        }),
      })
      try {
        expect(await run(f, [failed503, ...answer])).toEqual(offline)
        expect(asked).toHaveLength(0)
        expect(starts(f)).toBe(1)
        armed = false
        expect((await state(f)).phase).not.toBe('settled')
        expect(await f.drive()).toEqual({ ok: undefined })
        expect(await termination(f)).toEqual({ kind: 'completed', reason: 'stop' })
        expect(starts(f)).toBe(2)
      } finally {
        await f.dispose()
      }
    },
  )

  it('an unknown answer of the position write ends the drive, and the call does not settle', async () => {
    let controls: F['controls'] | undefined
    const { f, asked } = world(input => again(input), {
      wrap: commands => ({
        ...commands,
        prepareRetry: async input => {
          controls?.commands.injectUnknown({
            tenant: input.tenant,
            call: input.call,
            operation: input.operation,
            method: 'prepareRetry',
            effect: 'not-applied',
          })
          return commands.prepareRetry(input)
        },
      }),
    })
    controls = f.controls
    try {
      expect(await run(f, [failed503, ...answer])).toMatchObject({
        failure: { kind: 'commit-unknown' },
      })
      expect((await state(f)).phase).toBe('running')
      expect(asked).toHaveLength(0)
      expect(starts(f)).toBe(1)
    } finally {
      await f.dispose()
    }
  })

  it('a wake request that the host refuses ends the drive with that failure', async () => {
    const { f } = world(input => again(input, LATER))
    const closed = {
      failure: {
        kind: 'unavailable',
        dependency: 'model-instance-host',
        diagnostic: 'host-closed',
      },
    } as const
    const schedule = f.dependencies.instances.schedule
    f.dependencies.instances.schedule = async input =>
      input.notBefore === undefined ? schedule(input) : closed
    try {
      expect(await run(f, [failed503, ...answer])).toEqual(closed)
      expect((await state(f)).phase).toBe('retry-decision')
    } finally {
      await f.dispose()
    }
  })

  it('does not ask the policy again after it chose to settle and the settlement answer was unknown', async () => {
    let controls: F['controls'] | undefined
    let injected = false
    const { f, asked } = world(
      () => ({
        failure: { kind: 'unavailable', dependency: 'policy', diagnostic: 'not-provided' },
      }),
      {
        wrap: commands => ({
          ...commands,
          settle: async input => {
            if (!injected) {
              injected = true
              controls?.commands.injectUnknown({
                tenant: input.tenant,
                call: input.call,
                operation: input.operation,
                method: 'settle',
                effect: 'not-applied',
              })
            }
            return commands.settle(input)
          },
        }),
      },
    )
    controls = f.controls
    try {
      const first = (await run(f, [failed503])) as { failure: { operation: string } }
      expect(first).toMatchObject({ failure: { kind: 'commit-unknown' } })
      f.controls.commands.reveal({
        tenant: f.tenant,
        call: f.admit.call,
        operation: first.failure.operation as never,
        result: 'not-committed',
      })
      expect(await f.drive()).toEqual({ ok: undefined })
      expect(await termination(f)).toMatchObject({ fault: { cause: 'policy-unavailable' } })
      expect(asked).toHaveLength(1)
    } finally {
      await f.dispose()
    }
  })
})

describe('the receiver of an earlier dispatch', () => {
  it('a failed release of it is reported when the call ends, and the call still settles', async () => {
    const { f } = world(input => again(input))
    const channel = f.channel(f.admit.call)
    let releases = 0
    channel.beforeRelease = async () => {
      channel.releaseFails = ++releases === 1
    }
    try {
      expect(await run(f, [failed503, ...answer])).toMatchObject({
        failure: { kind: 'unavailable', diagnostic: 'resource-release-failed' },
      })
      expect(await termination(f)).toEqual({ kind: 'completed', reason: 'stop' })
      expect(channel).toMatchObject({ starts: 2, closes: 2 })
    } finally {
      await f.dispose()
    }
  })
})

describe('the default policy with fallback over three suppliers', () => {
  it('sends to each supplier once in the declared order, and the last fault settles the call', async () => {
    const [first] = request.suppliers
    const others = ['second', 'third'].map(name => ({
      ...first,
      adoption: { ...adoption, name },
      model: name,
    }))
    const policy = createDefaultRetryPolicy<Principal>({
      adoption: request.retryPolicy,
      policy: { maxAttempts: 5, maxElapsedMs: 1000, delaysMs: [0], jitter: 0 },
      replayResend: { max: 1 },
      clock: { now: () => START },
      random: () => 0,
    })
    const f = runtimeFixture({}, undefined, undefined, undefined, policy, others)
    const [declaration] = request.declarations
    const fixed: FixedModelRequest = {
      ...request,
      suppliers: [first, ...others],
      fallback: true,
      declarations: [declaration, declaration, declaration],
    }
    const admit = { ...f.admit, request: fixed }
    const adapter = f.options.evidence[0]
    if (!adapter) throw new Error('missing evidence adapter')
    adapter.receive = input => ({
      ok: { window: input.window, batchDigest: input.batchDigest, paused: true, noPrefetch: true },
    })
    adapter.retry = verifyRetryDecision
    const fault504: ModelFault = { ...fault503, upstreamStatus: '504', diagnostic: 'http-504' }
    try {
      unbox(await f.provider.runtime.calls.admit(admit))
      await f.start(admit.call)
      f.channel(admit.call).push([
        failed503,
        failed503,
        { kind: 'ended', termination: { kind: 'failed', fault: fault504 } },
      ])
      await eventually(() => f.results.has(admit.call))
      expect(f.results.get(admit.call)).toEqual({ ok: undefined })

      expect(f.channel(admit.call).suppliers).toEqual(['test', 'second', 'third'])
      const current = await state(f)
      expect(current).toMatchObject({
        phase: 'settled',
        settlement: { termination: { kind: 'failed', fault: fault504 } },
        attempts: { allowed: 3, made: 3 },
      })
      expect(await dispatches(f)).toHaveLength(3)
    } finally {
      await f.dispose()
    }
  })
})

describe('the call state tells how far its dispatches got', () => {
  it('counts the dispatches the request allows and the ones made, and keeps the last fault and the next instant', async () => {
    const { f } = world(input => again(input, LATER))
    try {
      unbox(await f.provider.runtime.calls.admit(f.admit))
      expect((await state(f)).attempts).toEqual({
        allowed: 2,
        made: 1,
        last: null,
        notBefore: null,
      })
      await f.start(f.admit.call)
      f.channel(f.admit.call).push([failed503, ...answer])
      await eventually(() => f.results.has(f.admit.call))
      expect((await state(f)).attempts).toEqual({
        allowed: 2,
        made: 1,
        last: fault503,
        notBefore: LATER,
      })
      f.controls.clock.advanceTo(LATER)
      expect(await f.drive()).toEqual({ ok: undefined })
      const settled = await state(f)
      expect(settled.attempts).toEqual({ allowed: 2, made: 2, last: fault503, notBefore: null })
      expect(settled.attempts?.made).toBe((await dispatches(f)).length)
    } finally {
      await f.dispose()
    }
  })

  it('shows every change of the progress to an observer of the call', async () => {
    const { f } = world(input => again(input))
    try {
      unbox(await f.provider.runtime.calls.admit(f.admit))
      const route = unbox(
        await f.provider.runtime.instances.connect({
          principal: f.principal,
          tenant: f.tenant,
          reference: f.reference,
        }),
      )
      if (route.kind !== 'live') throw new Error('missing live route')
      const seen: string[] = []
      const watching = (async () => {
        const stream = route.handle.observe({ ...f.admit, signal: new AbortController().signal })
        for await (const item of stream) {
          if (item.kind === 'ended') break
          const { attempts, phase } = item.value.state
          const text = JSON.stringify([attempts?.made, attempts?.last?.cause ?? null])
          if (seen.at(-1) !== text) seen.push(text)
          if (phase === 'settled') break
        }
      })()
      await f.start(f.admit.call)
      f.channel(f.admit.call).push([failed503, ...answer])
      await eventually(() => f.results.has(f.admit.call))
      await watching
      expect(seen).toEqual([
        JSON.stringify([1, null]),
        JSON.stringify([1, 'upstream-unavailable']),
        JSON.stringify([2, 'upstream-unavailable']),
      ])
    } finally {
      await f.dispose()
    }
  })

  it('a decision to stop leaves no next instant, and a call recorded without progress stays without it', () => {
    const progress = { allowed: 2, made: 1, last: fault503, notBefore: LATER }
    const call = { state: { attempts: progress }, dispatches: [] } as unknown as CallDocument
    recordRetryDecision(call, { kind: 'stop', fault: fault503 }, proof('decision', 'retry'))
    expect(call.state.attempts).toEqual({ ...progress, notBefore: null })

    const old = { state: {}, dispatches: [{}] } as unknown as CallDocument
    beginAttempt(old)
    expect(old.state).toEqual({})
  })

  it('starts at no dispatch made, and allows one dispatch for each supplier when the request falls back', async () => {
    const { f } = world(input => again(input))
    try {
      unbox(await f.dependencies.commands.admit(f.admit))
      expect((await state(f)).attempts).toEqual({
        allowed: 2,
        made: 0,
        last: null,
        notBefore: null,
      })
    } finally {
      await f.dispose()
    }
    const [supplier] = f.admit.request.suppliers
    const three = [supplier, supplier, supplier] as const
    expect(initialAttempts({ fallback: true, suppliers: three }).allowed).toBe(3)
    expect(initialAttempts({ fallback: false, suppliers: three }).allowed).toBe(2)
  })
})

// T2 rows 1 and 2 through the runtime: the resend goes out at once without reasoning state.
describe('a refusal of the reasoning state the dispatch carried', () => {
  const refused: ModelFault = {
    cause: 'replay-rejected',
    replayCarried: true,
    diagnostic: 'replay-signature',
    upstreamStatus: '400',
  }
  const refusal: TransportFact = { kind: 'ended', termination: { kind: 'failed', fault: refused } }
  const seen = { toHuman: true, toModel: true }
  const message = (value: unknown) => {
    const judged = judgeMessage(value)
    if ('rejected' in judged) throw new Error(`fixture message: ${judged.rejected}`)
    return judged.ok
  }
  const reply = message({
    id: 'msg_reply000000000000000000',
    role: 'assistant',
    blocks: [
      { kind: 'text', id: 'a', visibility: seen, text: 'earlier answer' },
      {
        kind: 'reasoning_state',
        id: 'r',
        visibility: { toHuman: false, toModel: true },
        payload: 'sealed',
        pairs: [],
      },
    ],
    replay: { scope: 'test.invalid/test', format: 'test-format-v1', at: [1] },
  })
  const ask = (id: string) =>
    message({
      id,
      role: 'user',
      blocks: [{ kind: 'text', id: 'q', visibility: seen, text: 'ask' }],
    })
  const plain = message({
    id: 'msg_plain000000000000000000',
    role: 'assistant',
    blocks: [{ kind: 'text', id: 'p', visibility: seen, text: 'a reply without a mark' }],
  })
  const fixed: FixedModelRequest = {
    ...request,
    messages: [
      ask('msg_ask0000000000000000000'),
      plain,
      ask('msg_ask1000000000000000000'),
      reply,
      ask('msg_ask2000000000000000000'),
    ],
  }

  function resending(max = 1) {
    const policy = createDefaultRetryPolicy<Principal>({
      adoption: request.retryPolicy,
      policy: { maxAttempts: 5, maxElapsedMs: 1000, delaysMs: [0], jitter: 0 },
      replayResend: { max },
      clock: { now: () => START },
      random: () => 0,
    })
    const f = runtimeFixture({}, undefined, undefined, undefined, policy)
    const adapter = f.options.evidence[0]
    if (!adapter) throw new Error('missing evidence adapter')
    adapter.receive = input => ({
      ok: { window: input.window, batchDigest: input.batchDigest, paused: true, noPrefetch: true },
    })
    adapter.retry = verifyRetryDecision
    return { f, admit: { ...f.admit, request: fixed } }
  }
  async function settled(f: F, admit: F['admit'], facts: readonly TransportFact[]) {
    unbox(await f.provider.runtime.calls.admit(admit))
    await f.start(admit.call)
    f.channel(admit.call).push(facts)
    await eventually(() => f.results.has(admit.call))
    return f.channel(admit.call)
  }

  it('row 1: sends again at once to the same supplier without the reasoning state, and the reply settles the call', async () => {
    const { f, admit } = resending()
    try {
      const channel = await settled(f, admit, [refusal, ...answer])
      expect(channel.resent).toEqual([[], [reply.id]])
      expect(channel.suppliers).toEqual(['test', 'test'])
      expect((await dispatches(f)).map(d => d.withoutReplay)).toEqual([undefined, 'resend'])
      expect(await termination(f)).toEqual({ kind: 'completed', reason: 'stop' })
      expect((await state(f)).attempts).toMatchObject({ allowed: 2, made: 2 })
    } finally {
      await f.dispose()
    }
  })

  it('row 2: a refusal after the resend ends the call with the refusal', async () => {
    const { f, admit } = resending()
    try {
      await settled(f, admit, [refusal, refusal])
      expect(await termination(f)).toEqual({ kind: 'failed', fault: refused })
      expect(await dispatches(f)).toHaveLength(2)
    } finally {
      await f.dispose()
    }
  })

  it('row 2 with no resend allowed: ends the call with the refusal at once', async () => {
    const { f, admit } = resending(0)
    try {
      await settled(f, admit, [refusal])
      expect(await termination(f)).toEqual({ kind: 'failed', fault: refused })
      expect(await dispatches(f)).toHaveLength(1)
    } finally {
      await f.dispose()
    }
  })

  it.each([
    [
      'to a supplier other than the one that refused it',
      [refusal],
      (input: Decide): RetryDecision => ({
        kind: 'resend-without-replay',
        supplier: { ...input.request.suppliers[0], model: 'another-model' },
      }),
      1,
    ],
    [
      'a second time in the call',
      [refusal, refusal],
      (input: Decide): RetryDecision => ({
        kind: 'resend-without-replay',
        supplier: input.request.suppliers[0],
      }),
      2,
    ],
  ])(
    'refuses a decision to send again without reasoning state %s, and settles as policy-unavailable',
    async (_name, facts, decision, made) => {
      const { f } = world(input => decided(input, decision(input)))
      try {
        expect(await run(f, facts)).toEqual({ ok: undefined })
        expect(await termination(f)).toEqual({
          kind: 'failed',
          fault: {
            cause: 'policy-unavailable',
            diagnostic: 'decision-refused',
            upstreamStatus: null,
          },
        })
        expect(await dispatches(f)).toHaveLength(made)
      } finally {
        await f.dispose()
      }
    },
  )

  it('every later dispatch of the call carries no reasoning state, and the resend takes no ordinary place', async () => {
    const { f, admit } = resending()
    try {
      const channel = await settled(f, admit, [refusal, failed503, ...answer])
      expect(channel.resent).toEqual([[], [reply.id], [reply.id]])
      expect((await dispatches(f)).map(d => d.withoutReplay)).toEqual([
        undefined,
        'resend',
        'later',
      ])
      expect(await termination(f)).toEqual({ kind: 'completed', reason: 'stop' })
      expect((await state(f)).attempts).toMatchObject({ allowed: 2, made: 3 })
    } finally {
      await f.dispose()
    }
  })
})
