import { afterEach, expect, it } from 'vitest'
import { SettingsOwnerProjectionSchema } from '@omne-harness/settings-local'
import { openWorld, pinned, grants, target, type World } from './world.ts'
const worlds: World[] = []
async function open() {
  const world = await openWorld()
  worlds.push(world)
  await world.setup()
  return world
}
afterEach(async () => {
  await Promise.all(worlds.splice(0).map(world => world.close()))
})
async function view(world: World) {
  const captured = await world.capture()
  if (captured.kind !== 'committed') throw new Error(JSON.stringify(captured))
  return SettingsOwnerProjectionSchema.parse(captured.responses[0]?.reply.response).views[0]
}
it('rejects immutable version replacement, revision conflicts and reuse of operation IDs', async () => {
  const world = await open()
  expect(
    await world.owner.publish({
      operationId: 'change-body',
      assetRef: 'asset-a',
      pinned: pinned('1', true),
      expectedRevision: 1,
    }),
  ).toEqual({ kind: 'rejected', reason: 'version_conflict' })
  expect(
    await world.owner.publish({
      operationId: 'stale',
      assetRef: 'asset-a',
      pinned: pinned('2'),
      expectedRevision: 0,
    }),
  ).toEqual({ kind: 'rejected', reason: 'revision_conflict' })
  expect(await world.owner.getOperation('stale')).toEqual({
    kind: 'rejected',
    reason: 'revision_conflict',
  })
  expect(
    await world.owner.publish({
      operationId: 'publish-1',
      assetRef: 'asset-a',
      pinned: pinned('2'),
      expectedRevision: 1,
    }),
  ).toEqual({ kind: 'rejected', reason: 'operation_conflict' })
  expect(await world.owner.readVersion({ assetRef: 'asset-a', version: '2' })).toEqual({
    kind: 'absent',
  })
})
it('follows new publications and keeps pinned versions while owner revisions cannot repeat', async () => {
  const world = await open()
  const first = await view(world)
  expect(
    await world.owner.publish({
      operationId: 'publish-2',
      assetRef: 'asset-a',
      pinned: pinned('2', true),
      expectedRevision: 1,
    }),
  ).toMatchObject({ kind: 'committed', revision: 2 })
  const latest = await view(world)
  expect(latest?.definitionRef.version).toBe('2')
  expect(latest?.ownerRevision).toBeGreaterThan(first?.ownerRevision ?? 0)
  expect(
    await world.owner.changeHolding({
      operationId: 'pin',
      ...targetInput(),
      expectedRevision: 1,
      change: { kind: 'selectVersion', selection: { kind: 'pinned', version: '1' } },
    }),
  ).toMatchObject({ kind: 'committed', revision: 2 })
  const fixed = await view(world)
  expect(fixed?.definitionRef.version).toBe('1')
  expect(fixed?.ownerRevision).toBeGreaterThan(latest?.ownerRevision ?? 0)
  await world.owner.publish({
    operationId: 'publish-3',
    assetRef: 'asset-a',
    pinned: pinned('3'),
    expectedRevision: 2,
  })
  expect(await view(world)).toEqual(fixed)
  expect(
    await world.owner.changeHolding({
      operationId: 'pin-missing',
      ...targetInput(),
      expectedRevision: 2,
      change: { kind: 'selectVersion', selection: { kind: 'pinned', version: 'missing' } },
    }),
  ).toEqual({ kind: 'rejected', reason: 'invalid_selection' })
})
it('updates source layout and grants only with the current holding revision', async () => {
  const world = await open()
  const first = await view(world)
  expect(
    await world.owner.changeHolding({
      operationId: 'sources',
      ...targetInput(),
      expectedRevision: 1,
      change: { kind: 'updateSources', sourceIds: ['organization', 'tenant'], grants },
    }),
  ).toMatchObject({ kind: 'committed', revision: 2 })
  const changed = await view(world)
  expect(changed?.sourceIds).toEqual(['organization', 'tenant'])
  expect(changed?.ownerRevision).toBeGreaterThan(first?.ownerRevision ?? 0)
  expect(
    await world.owner.changeHolding({
      operationId: 'bad-grants',
      ...targetInput(),
      expectedRevision: 2,
      change: { kind: 'updateGrants', grants: [{ sourceId: 'missing', actions: ['set'] }] },
    }),
  ).toEqual({ kind: 'rejected', reason: 'invalid_input' })
  expect(
    await world.owner.changeHolding({
      operationId: 'stale-grants',
      ...targetInput(),
      expectedRevision: 1,
      change: { kind: 'updateGrants', grants: [] },
    }),
  ).toEqual({ kind: 'rejected', reason: 'revision_conflict' })
  expect(
    await world.owner.changeHolding({
      operationId: 'revoke',
      ...targetInput(),
      expectedRevision: 2,
      change: { kind: 'updateGrants', grants: [] },
    }),
  ).toMatchObject({ kind: 'committed', revision: 3 })
  expect((await view(world))?.grants).toEqual([])
})
it('retains removed holding identities and allows a fresh holding without reviving the old one', async () => {
  const world = await open()
  expect(
    await world.owner.changeHolding({
      operationId: 'remove',
      ...targetInput(),
      expectedRevision: 1,
      change: { kind: 'remove' },
    }),
  ).toMatchObject({ kind: 'committed', revision: 2 })
  expect(await world.owner.readHolding(targetInput())).toMatchObject({
    kind: 'holding',
    holding: { state: 'removed' },
    selected: null,
  })
  const input = {
    assetRef: 'asset-a',
    selection: { kind: 'follow' as const },
    sourceIds: ['tenant'],
    grants,
    ...targetInput(),
  }
  expect(await world.owner.hold({ operationId: 'recreate', ...input })).toEqual({
    kind: 'rejected',
    reason: 'holding_removed',
  })
  expect(
    await world.owner.hold({ operationId: 'new-holding', ...input, holdingRef: 'holding-b' }),
  ).toMatchObject({ kind: 'committed', revision: 1 })
  expect(
    await world.owner.changeHolding({
      operationId: 'revive',
      ...targetInput(),
      expectedRevision: 2,
      change: { kind: 'selectVersion', selection: { kind: 'follow' } },
    }),
  ).toEqual({ kind: 'rejected', reason: 'holding_removed' })
})
function targetInput() {
  return { holdingRef: target.targetRef, scopeRef: target.scopeRef }
}

it('serializes concurrent publications against one current asset revision', async () => {
  const world = await open()
  const results = await Promise.all(
    ['2', '3'].map(version =>
      world.owner.publish({
        operationId: `concurrent-${version}`,
        assetRef: 'asset-a',
        pinned: pinned(version),
        expectedRevision: 1,
      }),
    ),
  )
  expect(results.filter(result => result.kind === 'committed')).toHaveLength(1)
  expect(results.filter(result => result.kind === 'rejected')).toEqual([
    { kind: 'rejected', reason: 'revision_conflict' },
  ])
  const selected = await view(world)
  const winner = results[0]?.kind === 'committed' ? '2' : '3'
  expect(selected?.definitionRef.version).toBe(winner)
  expect(
    await world.owner.readVersion({ assetRef: 'asset-a', version: winner === '2' ? '3' : '2' }),
  ).toEqual({ kind: 'absent' })
})

it('keeps same-name publications separate and refuses a second active holding', async () => {
  const world = await open()
  expect(
    await world.owner.publish({
      operationId: 'other-publish',
      assetRef: 'asset-b',
      pinned: pinned('1', true),
      expectedRevision: 0,
    }),
  ).toMatchObject({ kind: 'committed' })
  expect(
    await world.owner.hold({
      operationId: 'other-hold',
      holdingRef: 'holding-b',
      scopeRef: 'tenant-a',
      assetRef: 'asset-b',
      selection: { kind: 'follow' },
      sourceIds: ['tenant'],
      grants,
    }),
  ).toEqual({ kind: 'rejected', reason: 'holding_exists' })
  expect((await view(world))?.definition.items[0]?.default).toEqual({ kind: 'value', value: false })
})
