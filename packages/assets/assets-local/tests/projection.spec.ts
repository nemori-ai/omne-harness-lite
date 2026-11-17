import { ownerSources } from './sources.ts'
import { afterEach, expect, it } from 'vitest'
import { SettingsOwnerProjectionSchema } from '@omne-harness/settings-local'
import { assetsSettingsProjectionCommand, assetsSqlMaterials } from '../src/index.ts'
import { createCategoryPoint } from '@omne-harness/assets'
import { grants, noteBody, openWorld, pinned, service, target, type World } from './world.ts'
const worlds: World[] = []
async function open(setup = true) {
  const world = await openWorld()
  worlds.push(world)
  if (setup) await world.setup()
  return world
}
afterEach(async () => {
  await Promise.all(worlds.splice(0).map(world => world.close()))
})
it('captures actual declared asset targets and never invents a runtime selection', async () => {
  const world = await open()
  const result = await world.capture()
  expect(result.kind).toBe('committed')
  if (result.kind !== 'committed') throw new Error('capture failed')
  const fact = SettingsOwnerProjectionSchema.parse(result.responses[0]?.reply.response)
  expect(fact.views).toHaveLength(1)
  expect(fact.views[0]).toMatchObject({
    target,
    definition: { items: [{ id: 'enabled', default: { kind: 'value', value: false } }] },
    grants,
    sources: ownerSources('tenant'),
  })
  for (const request of [
    { mode: 'runtime' as const, targets: [] },
    { targets: [{ policyId: 'independent', targetRef: 'preferences', scopeRef: 'tenant-a' }] },
  ]) {
    const captured = await world.capture(request)
    expect(captured.kind).toBe('committed')
    if (captured.kind === 'committed')
      expect(
        SettingsOwnerProjectionSchema.parse(captured.responses[0]?.reply.response).views,
      ).toEqual([])
  }
  const runtime = await world.capture({
    mode: 'runtime',
    targets: [target],
    selectionRef: 'consumer-selected',
  })
  expect(runtime.kind).toBe('committed')
  if (runtime.kind === 'committed')
    expect(
      SettingsOwnerProjectionSchema.parse(runtime.responses[0]?.reply.response).views,
    ).toHaveLength(1)
})
it('safely rejects removed, nonexistent, cross-scope and cross-domain projection bindings', async () => {
  const world = await open()
  for (const wrong of [
    { ...target, scopeRef: 'tenant-b' },
    { ...target, targetRef: 'missing' },
  ])
    expect((await world.capture({ targets: [wrong] })).kind).toBe('rolled_back')
  const result = await world.storage.commit({
    identity: {
      ...world.domain,
      operation: 'projection.misbound',
      protocolVersion: '2',
      operationKey: 'misbound',
    },
    combinationVersion: world.combination.combinationVersion,
    manifestDigest: world.combination.manifestDigest,
    commands: [
      assetsSettingsProjectionCommand(
        {
          domain: { ...world.domain, scope: { kind: 'tenant', tenant: 'tenant-b' } },
          principalRef: 'alice',
          captureId: 'misbound',
          request: {
            deploymentRef: 'deployment',
            mode: 'management',
            targets: [],
            selectionRef: null,
          },
        },
        { excluded: [] },
      ),
    ],
  })
  expect(result.kind).toBe('rolled_back')
  await world.owner.changeHolding({
    operationId: 'remove',
    holdingRef: 'holding-a',
    scopeRef: 'tenant-a',
    expectedRevision: 1,
    change: { kind: 'remove' },
  })
  expect((await world.capture({ targets: [target] })).kind).toBe('rolled_back')
  const empty = await world.capture()
  expect(empty.kind).toBe('committed')
  if (empty.kind === 'committed')
    expect(SettingsOwnerProjectionSchema.parse(empty.responses[0]?.reply.response).views).toEqual(
      [],
    )
})
it('returns an empty projection for a tenant with no asset publications', async () => {
  const world = await open(false)
  const result = await world.capture()
  expect(result.kind).toBe('committed')
  if (result.kind === 'committed')
    expect(SettingsOwnerProjectionSchema.parse(result.responses[0]?.reply.response).views).toEqual(
      [],
    )
})
it('refuses management overflow instead of truncating 129 real holdings into success', async () => {
  const world = await open(false)
  for (let index = 0; index < 129; index++) {
    const assetRef = `asset-${index}`,
      holdingRef = `holding-${index}`
    expect(
      await world.owner.publish({
        operationId: `publish-${index}`,
        assetRef,
        pinned: pinned('1', false, `service-${index}`),
        expectedRevision: 0,
      }),
    ).toMatchObject({ kind: 'committed' })
    expect(
      await world.owner.hold({
        operationId: `hold-${index}`,
        assetRef,
        holdingRef,
        scopeRef: 'tenant-a',
        selection: { kind: 'follow' },
        sources: ownerSources('tenant'),
        grants,
      }),
    ).toMatchObject({ kind: 'committed' })
  }
  const result = await world.capture()
  expect(result.kind).toBe('rolled_back')
  if (result.kind !== 'rolled_back') throw new Error('expected rejection')
  expect(result.responses.at(-1)?.reply).toMatchObject({
    kind: 'conflict',
    basis: { failure: { kind: 'rejected', reason: 'limit_exceeded' } },
  })
  const explicit = await world.capture({ targets: [{ ...target, targetRef: 'holding-128' }] })
  expect(explicit.kind).toBe('committed')
}, 30000)
async function serviceAndNoteWorld() {
  const point = createCategoryPoint()
  point.contribute(service)
  point.contribute({
    contract: { ...service.contract, category: 'note' },
    display: { title: 'Note', summary: 'A second category that exists only in these tests.' },
  })
  const world = await openWorld({ categories: point })
  worlds.push(world)
  return world
}
async function holdOne(world: World, category: 'service' | 'note', name: string) {
  const assetRef = `${category}-asset-${name}`
  const published = await world.owner.publish({
    operationId: `publish-${name}`,
    assetRef,
    pinned: category === 'service' ? pinned('1', false, name) : noteBody(name),
    expectedRevision: 0,
  })
  expect(published).toMatchObject({ kind: 'committed' })
  const held = await world.owner.hold({
    operationId: `hold-${name}`,
    assetRef,
    holdingRef: `holding-${name}`,
    scopeRef: 'tenant-a',
    selection: { kind: 'follow' },
    sources: ownerSources('tenant'),
    grants,
  })
  expect(held).toMatchObject({ kind: 'committed' })
}
function capturedRefs(result: Awaited<ReturnType<World['capture']>>): string[] {
  if (result.kind !== 'committed') throw new Error('capture failed')
  const views = SettingsOwnerProjectionSchema.parse(result.responses[0]?.reply.response).views
  return views.map(view => view.target.targetRef)
}
it('leaves out the holdings of the categories the caller excludes, so they do not count to the limit', async () => {
  const world = await serviceAndNoteWorld()
  const holdAll = async (category: 'service' | 'note', count: number) => {
    for (let index = 0; index < count; index++)
      await holdOne(world, category, `${category}-${index}`)
  }
  await holdAll('service', 6)
  await holdAll('note', 130)
  expect(capturedRefs(await world.capture({}, { excluded: ['note'] }))).toEqual(
    [0, 1, 2, 3, 4, 5].map(index => `holding-service-${index}`),
  )
  const both = await world.capture()
  expect(both.kind).toBe('rolled_back')
  if (both.kind !== 'rolled_back') throw new Error('expected rejection')
  expect(both.responses.at(-1)?.reply).toMatchObject({
    basis: { failure: { kind: 'rejected', reason: 'limit_exceeded' } },
  })
}, 60000)
it('orders the holdings of several categories by holding, as one scan of every holding would', async () => {
  const world = await serviceAndNoteWorld()
  await holdOne(world, 'service', 'a')
  await holdOne(world, 'note', 'b')
  await holdOne(world, 'service', 'c')
  expect(capturedRefs(await world.capture())).toEqual(['holding-a', 'holding-b', 'holding-c'])
}, 60000)
it('provides only the projection fact and the publication fact', () => {
  expect(assetsSqlMaterials().participants[0]?.providesFacts.map(fact => fact.key)).toEqual([
    'settings.assets-projection',
    'assets.current-publication',
  ])
})
