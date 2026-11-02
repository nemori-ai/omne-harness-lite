import { expect, it } from 'vitest'
import { accepted, fixture, unbox } from './fixture.ts'

it('C01 executes once through production services and releases the saved original delivery', async () => {
  const world = await fixture(async (value, environment) => `${environment.facts.system}:${value}`)
  try {
    const invocation = world.invocation('first')
    const first = accepted(await world.api.invoke(invocation))
    expect(accepted(await world.api.invoke(invocation))).toBe(first)
    const result = await world.settled(first)
    expect(result.terminal).toEqual({ kind: 'completed' })
    expect(result.value.content).toMatchObject([{ kind: 'text', text: 'frozen:{"value":"first"}' }])
    await expect.poll(() => world.deliveries.length).toBe(1)
    await expect
      .poll(async () => {
        const value = unbox(await world.api.queries.lookup(world.query(first)))
        return value.kind === 'found' ? value.state.delivery?.kind : null
      })
      .toBe('released')
    expect(world.launches()).toBe(1)
    expect(world.deliveries[0]?.consumer).toEqual(invocation.request.consumer)
  } finally {
    await world.close()
  }
})

it('retains and recognizes an unknown original raw output without re-executing the author', async () => {
  const world = await fixture()
  try {
    world.custody.controls.dropNextAnswer()
    const reference = accepted(await world.api.invoke(world.invocation('unknown-raw')))
    expect((await world.settled(reference)).terminal).toEqual({ kind: 'completed' })
    expect(world.launches()).toBe(1)
    expect(world.plugins.diagnostics().pendingOutputCustody).toBe(0)
  } finally {
    await world.close()
  }
})
