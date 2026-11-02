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

it('completed and definitely rejected calls release the bounded scheduling capacity', async () => {
  const world = await fixture(undefined, undefined, 1)
  try {
    const denied = world.invocation('bad-grant')
    expect(
      await world.api.invoke({
        ...denied,
        request: { ...denied.request, scope: { ...denied.request.scope, key: 'foreign' } },
      }),
    ).toMatchObject({ kind: 'rejected' })
    expect(world.plugins.diagnostics().executor?.knownCalls).toBe(0)
    const first = accepted(await world.api.invoke(world.invocation('first-slot')))
    await world.settled(first)
    await expect.poll(() => world.plugins.diagnostics().executor?.knownCalls).toBe(0)
    const second = accepted(await world.api.invoke(world.invocation('second-slot')))
    await world.settled(second)
    expect(world.launches()).toBe(2)
  } finally {
    await world.close()
  }
})

it('a new executor reads the original call but never attaches or restarts its old execution', async () => {
  let complete: (value: string) => void = () => {}
  const world = await fixture(
    () =>
      new Promise(resolve => {
        complete = resolve
      }),
  )
  let reopened: Awaited<ReturnType<typeof world.newExecutor>> | null = null
  try {
    const request = world.invocation('old-execution')
    const reference = accepted(await world.api.invoke(request))
    await expect.poll(() => world.launches()).toBe(1)
    await world.plugins.close()
    reopened = await world.newExecutor()
    expect(accepted(await reopened.api.invoke(request))).toBe(reference)
    const next = reopened
    await expect
      .poll(() => next.plugins.diagnostics().executor?.foreignExecutionRuns ?? 0)
      .toBeGreaterThan(0)
    expect(world.launches()).toBe(1)
    expect(unbox(await next.api.instances.current(world.query(reference))).current).toBeNull()
    expect(world.signals.get('{"value":"old-execution"}')?.aborted).toBe(false)
  } finally {
    complete('cleanup')
    await reopened?.close()
    await world.close()
  }
})
