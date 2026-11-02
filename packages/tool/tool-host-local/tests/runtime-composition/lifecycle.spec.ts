import { expect, it } from 'vitest'
import { createLocalToolRuntimePlugins } from '../../src/runtime-cordis.ts'
import { accepted, fixture, unbox } from './fixture.ts'

it('C05 requires a declared durable store and refuses foreign tenant reads', async () => {
  const world = await fixture()
  try {
    expect(() =>
      createLocalToolRuntimePlugins({
        ...world.input,
        store: { ...world.store, durability: 'none' },
      }),
    ).toThrow('durable')
    const reference = accepted(await world.api.invoke(world.invocation('isolation')))
    await world.settled(reference)
    expect(await world.api.queries.lookup(world.query(reference, world.tenantB))).toMatchObject({
      failure: { kind: 'denied' },
    })
  } finally {
    await world.close()
  }
})

it('receiver withdrawal preserves delivery, then restoration saves the original result', async () => {
  const world = await fixture()
  try {
    await world.removeReceiver()
    const reference = accepted(await world.api.invoke(world.invocation('receiver')))
    await world.settled(reference)
    expect(world.deliveries).toHaveLength(0)
    expect(unbox(await world.api.queries.lookup(world.query(reference)))).toMatchObject({
      state: { delivery: { kind: 'pending' } },
    })
    await world.restoreReceiver()
    await expect.poll(() => world.deliveries.length).toBe(1)
    expect(world.launches()).toBe(1)
  } finally {
    await world.close()
  }
})

it('missing execution provider leaves preparation pending and never invokes the author', async () => {
  const world = await fixture()
  try {
    await world.environments.dispose()
    const reference = accepted(await world.api.invoke(world.invocation('missing-environment')))
    await expect
      .poll(async () => {
        const read = unbox(await world.api.queries.lookup(world.query(reference)))
        return read.kind === 'found' ? read.state.phase : null
      })
      .toBe('preparing')
    expect(world.launches()).toBe(0)
  } finally {
    await world.close()
  }
})

it('C07 retirement rejects new work while preserving unresolved delivery for reads', async () => {
  const world = await fixture()
  try {
    await world.removeReceiver()
    const reference = accepted(await world.api.invoke(world.invocation('retired')))
    await world.settled(reference)
    await world.plugins.close()
    expect(await world.api.invoke(world.invocation('new'))).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'unavailable' },
    })
    expect(unbox(await world.api.queries.lookup(world.query(reference)))).toMatchObject({
      state: { delivery: { kind: 'pending' } },
    })
    expect(world.plugins.diagnostics().retired).toBe(true)
  } finally {
    await world.close()
  }
})
