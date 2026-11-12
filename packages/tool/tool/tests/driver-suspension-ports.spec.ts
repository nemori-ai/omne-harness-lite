// The driver of a checkpointed call and the answers of the ports it depends on (P06, P07): the
// binding that proves the checkpoint, the decision owner that registers the wait, and the queue
// that parks the entry. A port that cannot answer yet is asked again; a port that answers "not
// suspended" or "rejected" gives a verdict that no run repeats; a registration whose answer is
// not certain is resolved through its original operation, and an excluded original is asked again
// under the same identity.
import { describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { asking, askingAuthor, checkpointBinding, scriptedBridge } from './checkpoint-values.ts'
import { callId, evidence, ok, principalA, tenantA } from './runtime-values.ts'
import { admitCall, startHarness, testAuthority } from './start-values.ts'

const unavailable = (dependency: string) =>
  fail({ kind: 'unavailable', dependency, diagnostic: 'not yet' })

type Answer = (index: number) => unknown
type Faults = Readonly<{
  /** The answer of the `resolve` of the bindings, by its ordinal, or undefined for the real one. */
  resolve?: Answer
  /** The answer of the `suspend` of the checkpointed binding, by its ordinal. */
  suspend?: Answer
  /** The answer of `ensure` and of `inspectOperation` of the decision owner, by ordinal. */
  ensure?: Answer
  inspect?: Answer
  /** The decision owner registers the wait and loses the answer of the first ensure. */
  answerLost?: boolean
}>

async function suspendedWith(faults: Faults = {}) {
  const authority = testAuthority()
  const checkpoint = checkpointBinding(authority, askingAuthor())
  const bridge = scriptedBridge(faults.answerLost === true ? 'answer-lost' : 'registers')
  const counts = { resolve: 0, suspend: 0, ensure: 0, inspect: 0, commits: 0 }
  const ensured: string[] = []
  const decisions = {
    ...bridge,
    ensure: (input: Parameters<typeof bridge.ensure>[0]) => {
      counts.ensure += 1
      ensured.push(input.operation)
      return Promise.resolve(faults.ensure?.(counts.ensure) ?? bridge.ensure(input))
    },
    inspectOperation: (input: Parameters<typeof bridge.inspectOperation>[0]) => {
      counts.inspect += 1
      return Promise.resolve(faults.inspect?.(counts.inspect) ?? bridge.inspectOperation(input))
    },
  } as typeof bridge
  const harness = startHarness({
    authority,
    bindingsPort: () => ({
      ...checkpoint.bindings,
      resolve: async input => {
        counts.resolve += 1
        const injected = faults.resolve?.(counts.resolve)
        if (injected !== undefined) return injected as never
        const resolved = await checkpoint.bindings.resolve(input)
        if ('failure' in resolved || resolved.ok.kind !== 'checkpointed') return resolved
        const binding = resolved.ok
        return succeed({
          ...binding,
          suspend: async suspension => {
            counts.suspend += 1
            const injectedProof = faults.suspend?.(counts.suspend)
            return (injectedProof ?? (await binding.suspend(suspension))) as never
          },
        })
      },
    }),
    decisions,
    driverRetryDelayMs: 5,
    commands: base => ({
      ...base,
      suspend: input => {
        counts.commits += 1
        return base.suspend(input)
      },
    }),
  })
  await admitCall(harness, 'c1')
  await harness.drive('c1')
  for (let quiet = 0, round = 0; quiet < 3 && round < 300; round += 1) {
    await new Promise(resolve => setTimeout(resolve, 2))
    quiet = (await harness.host.runScheduled()) === 0 ? quiet + 1 : 0
  }
  const recovery = ok(
    await harness.commands.loadRecovery({
      principal: principalA,
      tenant: tenantA,
      call: callId('c1'),
    }),
  )
  return { recovery, counts, ensured, bridge, state: await harness.state('c1') }
}

/** The first answer is `answer`; every later one is the real one. */
const once =
  (answer: unknown): Answer =>
  index =>
    index === 1 ? answer : undefined
const reachedItsWait = (run: Awaited<ReturnType<typeof suspendedWith>>) => {
  expect(run.state.phase).toBe('suspended')
  expect(run.recovery.waits).toMatchObject([{ phase: 'open' }])
}

describe('the binding that proves the checkpoint', () => {
  it.each([2, 3, 4])(
    'is asked again when its %sth resolution is unavailable: the call still reaches its wait',
    async nth => {
      reachedItsWait(
        await suspendedWith({
          resolve: index => (index === nth ? unavailable('bindings') : undefined),
        }),
      )
    },
  )

  it('is asked again for a proof that is unknown, and the call reaches its wait', async () => {
    const run = await suspendedWith({
      suspend: once(succeed({ kind: 'unknown', diagnostic: 'no answer yet' })),
    })
    reachedItsWait(run)
    expect(run.counts.suspend).toBe(2)
  })

  it('is asked again when the proof cannot be asked, and the call reaches its wait', async () => {
    const run = await suspendedWith({ suspend: once(unavailable('binding')) })
    reachedItsWait(run)
    expect(run.counts.suspend).toBe(2)
  })

  it.each([
    ['not suspended', succeed({ kind: 'not-suspended', evidence: evidence('not-suspended') })],
    ['rejected', succeed({ kind: 'rejected', diagnostic: 'the binding refuses' })],
  ])(
    'does not commit a checkpoint when the binding proves the segment is %s',
    async (_name, proof) => {
      const run = await suspendedWith({ suspend: once(proof) })
      // The proof carries no checkpoint: the ledger is asked for the commit once, with the real one.
      expect(run.counts.suspend).toBe(2)
      expect(run.counts.commits).toBe(1)
    },
  )
})

describe('the decision owner that registers the wait', () => {
  const lost = (index: number) =>
    index === 1 ? fail({ kind: 'commit-unknown', operation: 'op' }) : undefined

  it('is asked about the original operation, and asked again under the same identity when it excluded it', async () => {
    // The first ensure never landed, and its answer is lost: the owner excludes the original.
    const run = await suspendedWith({ ensure: lost as Answer })
    reachedItsWait(run)
    expect(run.ensured).toHaveLength(2)
    expect(new Set(run.ensured).size).toBe(1)
    expect(run.counts.inspect).toBeGreaterThanOrEqual(1)
  })

  it.each([
    ['pending', { kind: 'pending', operation: 'op', diagnostic: 'still deciding' }],
    ['unknown', { kind: 'unknown', operation: 'op', diagnostic: 'cannot tell' }],
  ])(
    'asks about the original again when the first inspection is %s, and ensures only once',
    async (_name, resolution) => {
      const run = await suspendedWith({ answerLost: true, inspect: once(succeed(resolution)) })
      reachedItsWait(run)
      expect(run.counts.ensure).toBe(1)
      expect(run.counts.inspect).toBe(2)
    },
  )

  // An owner that cannot answer yet recalls the original by the same identity (P06), so asking
  // again is a recall: no inspection first, and nothing of the failure is kept (U3, F2).
  it('asks again under the same identity after an unavailable ensure, without asking about the original', async () => {
    const run = await suspendedWith({ ensure: once(unavailable('decisions')) })
    reachedItsWait(run)
    expect(run.ensured).toHaveLength(2)
    expect(new Set(run.ensured).size).toBe(1)
    expect(run.counts.inspect).toBe(0)
  })

  it('does not take a refused inspection for an answer: the registration is asked again', async () => {
    const run = await suspendedWith({ answerLost: true, inspect: once(unavailable('decisions')) })
    reachedItsWait(run)
    expect(run.counts.ensure).toBe(1)
    expect(run.counts.inspect).toBe(2)
  })
})

describe('a call that waits a second time', () => {
  it('registers the second wait with its own request, not the request of the first', async () => {
    const authority = testAuthority()
    const author = askingAuthor(undefined, (_input, count) =>
      Promise.resolve(
        count === 1
          ? asking('{"asked":"which line?"}', 'which line?')
          : succeed({ kind: 'completed', value: 'done' }),
      ),
    )
    const checkpoint = checkpointBinding(authority, author)
    const bridge = scriptedBridge('registers')
    const harness = startHarness({
      authority,
      bindingsPort: () => checkpoint.bindings,
      decisions: bridge,
      driverRetryDelayMs: 5,
    })
    const settle = async () => {
      for (let quiet = 0, round = 0; quiet < 3 && round < 200; round += 1) {
        await new Promise(resolve => setTimeout(resolve, 2))
        quiet = (await harness.host.runScheduled()) === 0 ? quiet + 1 : 0
      }
    }
    await admitCall(harness, 'c1')
    await harness.drive('c1')
    await settle()
    bridge.decide('op-c1/start/wait', { kind: 'answer', value: { kind: 'string', value: 'a.txt' } })
    await harness.drive('c1')
    await settle()
    const recovery = ok(
      await harness.commands.loadRecovery({
        principal: principalA,
        tenant: tenantA,
        call: callId('c1'),
      }),
    )
    expect(recovery.waits).toHaveLength(2)
    const requests = recovery.waits.map(wait => wait.intent.request)
    expect(requests[0]).not.toEqual(requests[1])
    expect(bridge.ensured.map(entry => entry.request)).toEqual(requests)
  })
})

describe('a call whose identity leaves no room for the identities the driver derives', () => {
  /**
   * The start operation is `op-<call>/start`. The plan appends `/suspension`, the registration
   * `/wait/ensure` and its attachment `/attach`, and the limit of an identity is 256 characters.
   */
  async function runWithLongCall(callLength: number) {
    const authority = testAuthority()
    const checkpoint = checkpointBinding(authority, askingAuthor())
    const bridge = scriptedBridge('registers')
    const harness = startHarness({
      authority,
      bindingsPort: () => checkpoint.bindings,
      decisions: bridge,
      driverRetryDelayMs: 5,
    })
    const name = 'c'.repeat(callLength)
    await admitCall(harness, name)
    await harness.drive(name)
    for (let quiet = 0, round = 0; quiet < 3 && round < 200; round += 1) {
      await new Promise(resolve => setTimeout(resolve, 2))
      quiet = (await harness.host.runScheduled()) === 0 ? quiet + 1 : 0
    }
    const recovery = ok(
      await harness.commands.loadRecovery({
        principal: principalA,
        tenant: tenantA,
        call: callId(name),
      }),
    )
    return { recovery, state: await harness.state(name), bridge }
  }

  it('stops at the plan that has no identity: the call keeps running and nothing is planned', async () => {
    const { recovery, state } = await runWithLongCall(237)
    expect(state.phase).toBe('running')
    expect(recovery.suspensions).toEqual([])
  })

  it('opens the wait and registers it, and stops at the attachment that has no identity', async () => {
    const { recovery, state, bridge } = await runWithLongCall(235)
    expect(state.phase).toBe('suspended')
    expect(bridge.ensured).toHaveLength(1)
    expect(recovery.waits).toMatchObject([{ phase: 'opening' }])
  })
})
