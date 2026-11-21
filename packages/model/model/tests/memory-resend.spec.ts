import { describe, expect, it } from 'vitest'
import { decodeDispatchId, type ModelFault, type RetryDecision } from '@omne-harness/model-contract'
import type { TransportFact } from '@omne-harness/model-contract/provider'
import { digest } from '../src/testing/value.ts'
import { proof, unbox } from './memory-fixture.ts'
import { running } from './memory-dispatch.spec.ts'

const refused: ModelFault = {
  cause: 'replay-rejected',
  replayCarried: true,
  diagnostic: 'replay-signature',
  upstreamStatus: '400',
}
const offline: ModelFault = {
  cause: 'upstream-unavailable',
  diagnostic: 'offline',
  upstreamStatus: '503',
}
const next = unbox(decodeDispatchId('mdisp_two'))

async function positioned(fault: ModelFault) {
  const f = await running()
  unbox(
    await f.commands.openReceiveWindow({ ...(await f.write()), dispatch: f.dispatch, window: 'w' }),
  )
  const facts = [{ kind: 'ended', termination: { kind: 'failed', fault } }] satisfies [
    TransportFact,
  ]
  f.completeWindows.add(`${f.admit.call}/w/${digest(facts)}`)
  unbox(
    await f.commands.preserve({ ...(await f.write()), dispatch: f.dispatch, window: 'w', facts }),
  )
  const position = unbox(
    await f.commands.prepareRetry({ ...(await f.write()), dispatch: f.dispatch }),
  )
  const decide = async (decision: RetryDecision) =>
    f.commands.decideRetry({
      ...(await f.write()),
      position,
      decision,
      source: proof(position.operation, 'retry'),
    })
  const prepare = async (policyDecision: ReturnType<typeof proof> | null) =>
    f.commands.prepareDispatch({
      ...(await f.write()),
      dispatch: next,
      supplier: f.admit.request.suppliers[0],
      policyDecision,
    })
  const resend: RetryDecision = {
    kind: 'resend-without-replay',
    supplier: f.admit.request.suppliers[0],
  }
  return { ...f, decide, prepare, resend }
}

describe('the record of a dispatch, about content and reasoning state', () => {
  it('a first dispatch starts with no content proven and leaves reasoning state to the projection', async () => {
    const f = await running()
    const [record] = unbox(await f.commands.dispatches(f.admit))
    expect(record?.firstContent).toBe('none-proven')
    expect(Object.hasOwn(record ?? {}, 'withoutReplay')).toBe(false)
    expect(unbox(await f.commands.loadRecovery(f.admit)).state).toMatchObject({
      phase: 'running',
      firstContent: 'none-proven',
    })
  })
})

describe('a decision to send again without reasoning state, in the store', () => {
  it('is kept after a refusal of the reasoning state, and the next dispatch is the resend', async () => {
    const f = await positioned(refused)
    unbox(await f.decide(f.resend))
    const kept = unbox(await f.commands.loadRecovery(f.admit))
    expect(kept.retry).toEqual(f.resend)
    unbox(await f.prepare(kept.retrySource ?? null))
    const records = unbox(await f.commands.dispatches(f.admit))
    expect(records.map(record => record.withoutReplay)).toEqual([undefined, 'resend'])
  })

  it.each([
    ['after a failure that refused no reasoning state', offline, {}],
    ['to a supplier other than the one that refused it', refused, { model: 'another-model' }],
  ] as const)('is refused %s', async (_name, fault, supplier) => {
    const f = await positioned(fault)
    const decision = { ...f.resend, supplier: { ...f.resend.supplier, ...supplier } }
    expect(await f.decide(decision)).toEqual({
      failure: { kind: 'invalid', field: 'decision', reason: 'replay-resend' },
    })
  })

  it('a next dispatch without a decision is refused', async () => {
    const f = await positioned(refused)
    expect(await f.prepare(null)).toEqual({
      failure: { kind: 'invalid', field: 'policyDecision', reason: 'not-decided' },
    })
  })
})
