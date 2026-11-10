import { afterEach, expect, it } from 'vitest'
import { createGovernanceRuntime } from '../src/provider.ts'
import { openProviderWorld } from './provider-world.ts'
import { openSourceCoordinatorWorld } from './source-coordinator-world.ts'

const worlds: Awaited<ReturnType<typeof openSourceCoordinatorWorld>>[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})
async function setup() {
  const world = await openSourceCoordinatorWorld()
  worlds.push(world)
  const { options } = await openProviderWorld(world.governance)
  return { world, options }
}
it('refuses startup with outstanding source custody until its actual provider settles it', async () => {
  const { world: w, options } = await setup()
  await w.accept()
  expect(await w.coordinator().reserve(w.operation, w.governance.principal)).toMatchObject({
    kind: 'held',
  })
  expect(await createGovernanceRuntime(options)).toMatchObject({ kind: 'unavailable' })
  expect(await w.governance.services().sql.observe(w.operation)).toMatchObject({
    source: { kind: 'held' },
  })
  const runtime = await createGovernanceRuntime({ ...options, sourceReservations: w.service })
  expect(runtime.kind).toBe('created')
  if (runtime.kind !== 'created') return
  try {
    expect(await w.governance.services().sql.observe(w.operation)).toMatchObject({
      source: { kind: 'settled' },
      standing: { kind: 'settled' },
    })
    expect(await w.source.set()).toMatchObject({ kind: 'committed' })
  } finally {
    expect(await runtime.close()).toMatchObject({ kind: 'closed' })
  }
})
it('settles both responsibilities on close and keeps the borrowed Settings service alive', async () => {
  const { world: w, options } = await setup()
  const runtime = await createGovernanceRuntime({ ...options, sourceReservations: w.service })
  expect(runtime.kind).toBe('created')
  if (runtime.kind !== 'created') return
  await w.accept(runtime.epoch)
  expect(await w.coordinator().reserve(w.operation, w.governance.principal)).toMatchObject({
    kind: 'held',
  })
  expect(await runtime.close()).toMatchObject({ kind: 'closed' })
  const observed = await w.governance.services().sql.observe(w.operation)
  expect(observed).toMatchObject({ source: { kind: 'settled' }, standing: { kind: 'settled' } })
  if (observed.kind !== 'found' || observed.source.kind !== 'settled')
    throw new Error('Missing terminal source receipt')
  expect(await w.service.settle(observed.source.request)).toMatchObject({ kind: 'settled' })
  expect(await w.source.set()).toMatchObject({ kind: 'committed' })
})
