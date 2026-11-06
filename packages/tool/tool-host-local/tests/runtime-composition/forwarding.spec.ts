import { expect, it } from 'vitest'
import { accepted, fixture, unbox } from './fixture.ts'

it('forwards through the real executor binding at resource concurrency one and retires both calls', async () => {
  const world = await fixture(undefined, undefined, 2, true)
  try {
    for (let i = 0; i < 4; i++) {
      const parent = accepted(await world.api.invoke(world.forwardInvocation(`parent-${i}`)))
      await world.settled(parent)
      const answer = world.forwarded[i]
      expect(answer).toMatchObject({ kind: 'pending', parent })
      if (answer?.kind !== 'pending') throw new Error(JSON.stringify(answer))
      await world.settled(answer.reference)
      expect(world.launches()).toBe(i + 1)
      await expect.poll(() => world.plugins.diagnostics().executor?.knownCalls).toBe(0)
      expect(world.plugins.diagnostics().executor?.pacedDeliveries).toBe(0)
      const resumed = await world.plugins.forwarding()?.resume(world.query(parent))
      expect(resumed?.kind).toBe('accepted')
      expect(world.launches()).toBe(i + 1)
      const found = unbox(await world.api.queries.lookup(world.query(answer.reference)))
      expect(found).toMatchObject({ kind: 'found', state: { delivery: { kind: 'released' } } })
    }
  } finally {
    await world.close()
  }
})

it('reports unavailable at host capacity one without running a target effect', async () => {
  const world = await fixture(undefined, undefined, 1, true)
  try {
    const parent = accepted(await world.api.invoke(world.forwardInvocation('capacity-one')))
    await world.settled(parent)
    expect(world.forwarded).toMatchObject([
      { kind: 'rejected', failure: { kind: 'unavailable', dependency: 'tool-executor' } },
    ])
    expect(world.launches()).toBe(0)
    await expect.poll(() => world.plugins.diagnostics().executor?.knownCalls).toBe(0)
  } finally {
    await world.close()
  }
})

it('does not run a forwarded target when its current policy denies after preparation', async () => {
  let targetChecks = 0
  const world = await fixture(undefined, undefined, 2, true, {
    qualify: async ({ request }) => {
      if (request.availability.definition.name === 'Tools') return { kind: 'allowed' }
      targetChecks++
      return targetChecks < 3
        ? { kind: 'allowed' }
        : { kind: 'denied', reason: 'target-rule-revoked' }
    },
  })
  try {
    const parent = accepted(await world.api.invoke(world.forwardInvocation('policy-target')))
    await world.settled(parent)
    const answer = world.forwarded[0]
    if (answer?.kind !== 'pending') throw new Error(JSON.stringify(answer))
    await world.settled(answer.reference)
    expect(targetChecks).toBeGreaterThanOrEqual(3)
    expect(world.launches()).toBe(0)
    expect(unbox(await world.api.queries.lookup(world.query(answer.reference)))).toMatchObject({
      kind: 'found',
      state: { execution: { kind: 'not-started' } },
    })
    await expect.poll(() => world.plugins.diagnostics().executor?.knownCalls).toBe(0)
  } finally {
    await world.close()
  }
})

it('continues a slow accepted preparation after the parent finishes and drains the original slot before close', async () => {
  const entered = Promise.withResolvers<void>()
  const gate = Promise.withResolvers<void>()
  const world = await fixture(undefined, undefined, 2, true, undefined, async () => {
    entered.resolve()
    await gate.promise
  })
  try {
    const parent = accepted(await world.api.invoke(world.forwardInvocation('slow-preparation')))
    await entered.promise
    await world.settled(parent)
    expect(world.forwarded).toEqual([{ kind: 'association-unknown', parent }])
    expect((await world.plugins.forwarding()?.resume(world.query(parent)))?.kind).toBe(
      'association-unknown',
    )
    let drained = false
    const closing = world.forwarding.close().then(value => {
      drained = true
      return value
    })
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(drained).toBe(false)
    gate.resolve()
    await expect(closing).resolves.toEqual({ pending: 0, unknown: 0 })
    const resumed = await world.plugins.forwarding()?.resume(world.query(parent))
    if (resumed?.kind !== 'accepted') throw new Error(JSON.stringify(resumed))
    await world.settled(resumed.reference)
    expect(world.launches()).toBe(1)
    const again = await world.plugins.forwarding()?.resume(world.query(parent))
    expect(again).toMatchObject({ kind: 'accepted', reference: resumed.reference, recovered: true })
    expect(world.launches()).toBe(1)
    await expect.poll(() => world.plugins.diagnostics().executor?.knownCalls).toBe(0)
  } finally {
    gate.resolve()
    await world.close()
  }
})
