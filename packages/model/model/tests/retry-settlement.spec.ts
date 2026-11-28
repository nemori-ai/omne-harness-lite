import { describe, expect, it } from 'vitest'
import type { Termination } from '@omne-harness/model-contract'
import type { TransportFact, TransportTermination } from '@omne-harness/model-contract/provider'
import { digest } from '../src/testing/value.ts'
import { op, proof, unbox } from './memory-fixture.ts'
import { running } from './memory-dispatch.spec.ts'

const failed = {
  kind: 'failed',
  fault: { cause: 'upstream-unavailable', diagnostic: 'offline', upstreamStatus: '503' },
} as const satisfies TransportTermination
const policyUnavailable: Termination = {
  kind: 'failed',
  fault: { cause: 'policy-unavailable', diagnostic: 'not-provided', upstreamStatus: null },
}

type Reach = 'none' | 'positioned' | 'again' | 'stop'

async function atPolicyPoint(reach: Reach) {
  const f = await running()
  unbox(
    await f.commands.openReceiveWindow({ ...(await f.write()), dispatch: f.dispatch, window: 'w' }),
  )
  const facts = [{ kind: 'ended', termination: failed }] satisfies [TransportFact]
  f.completeWindows.add(`${f.admit.call}/w/${digest(facts)}`)
  unbox(
    await f.commands.preserve({ ...(await f.write()), dispatch: f.dispatch, window: 'w', facts }),
  )
  if (reach === 'none') return f
  const position = unbox(
    await f.commands.prepareRetry({ ...(await f.write()), dispatch: f.dispatch }),
  )
  if (reach === 'positioned') return f
  unbox(
    await f.commands.decideRetry({
      ...(await f.write()),
      position,
      decision:
        reach === 'stop'
          ? { kind: 'stop', fault: failed.fault }
          : {
              kind: 'retry',
              supplier: f.admit.request.suppliers[0],
              notBefore: '2026-10-19T00:00:00Z',
              basis: f.admit.request.retryPolicy,
            },
      source: proof(position.operation, 'retry'),
    }),
  )
  return f
}
type World = Awaited<ReturnType<typeof atPolicyPoint>>
const settle = async (f: World, termination: Termination) =>
  f.commands.settle({ ...(await f.write()), termination })
const stop = async (f: World) =>
  unbox(await f.commands.control({ ...f.admit, operation: op('stop'), intent: 'cancel' }))
const refusedAs = (reason: string) => ({
  failure: { kind: 'invalid', field: 'termination', reason },
})

describe('settlement of a call at the policy point', () => {
  it('without a retry record, the failed dispatch does not settle and neither does policy-unavailable', async () => {
    const f = await atPolicyPoint('none')
    expect(await settle(f, failed)).toMatchObject(refusedAs('retry-not-decided'))
    expect(await settle(f, policyUnavailable)).toMatchObject(refusedAs('retry-not-decided'))
  })

  it('with a position and no decision, only policy-unavailable settles', async () => {
    const f = await atPolicyPoint('positioned')
    expect(await settle(f, failed)).toMatchObject(refusedAs('retry-pending'))
    const settled = unbox(await settle(f, policyUnavailable))
    expect(settled.termination).toEqual(policyUnavailable)
    expect(unbox(await f.commands.loadRecovery(f.admit)).state.phase).toBe('settled')
  })

  it('with a decision to send again, nothing settles: the next step is the dispatch', async () => {
    const f = await atPolicyPoint('again')
    expect(await settle(f, failed)).toMatchObject(refusedAs('retry-pending'))
    expect(await settle(f, policyUnavailable)).toMatchObject(refusedAs('retry-pending'))
  })

  it('with a decision to stop, the fault of the decision settles', async () => {
    const f = await atPolicyPoint('stop')
    expect(unbox(await settle(f, failed)).termination).toEqual(failed)
  })

  it.each(['positioned', 'again'] as const)(
    'after a stop request, a call that is %s settles with the terminal of the failed dispatch',
    async reach => {
      const f = await atPolicyPoint(reach)
      await stop(f)
      expect(await settle(f, policyUnavailable)).toMatchObject(refusedAs('not-actual'))
      expect(unbox(await settle(f, failed)).termination).toEqual(failed)
    },
  )

  it('after a stop request, a call that is positioned cannot be decided or dispatched again', async () => {
    const f = await atPolicyPoint('again')
    await stop(f)
    expect(
      await f.commands.prepareDispatch({
        ...(await f.write()),
        dispatch: f.dispatch,
        supplier: f.admit.request.suppliers[0],
        policyDecision: null,
      }),
    ).toMatchObject({ failure: { kind: 'invalid' } })
  })
})
