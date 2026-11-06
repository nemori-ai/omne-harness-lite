import { ownerSources } from './sources.ts'
import { afterEach, expect, it } from 'vitest'
import { SettingsOwnerProjectionSchema } from '@omne-harness/settings-local'
import { assetsSettingsProjectionCommand, assetsSqlMaterials } from '../src/index.ts'
import { openWorld, pinned, grants, target, type World } from './world.ts'
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
      assetsSettingsProjectionCommand({
        domain: { ...world.domain, scope: { kind: 'tenant', tenant: 'tenant-b' } },
        principalRef: 'alice',
        captureId: 'misbound',
        request: {
          deploymentRef: 'deployment',
          mode: 'management',
          targets: [],
          selectionRef: null,
        },
      }),
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
it('can publish only projection facts in the two-owner consumer combination', () => {
  expect(assetsSqlMaterials().participants[0]?.providesFacts.map(fact => fact.key)).toEqual([
    'settings.current',
    'settings.assets-projection',
  ])
  expect(
    assetsSqlMaterials({ settingsGuard: false }).participants[0]?.providesFacts.map(
      fact => fact.key,
    ),
  ).toEqual(['settings.assets-projection'])
})
