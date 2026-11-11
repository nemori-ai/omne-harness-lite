import { afterEach, expect, it } from 'vitest'
import { pinBody, readBodyText } from '@omne-harness/assets'
import { canonicalDigest } from '@omne-harness/tool'
import { writeJsonText } from '@omne-harness/json-text'
import { toolAssetsWorld } from './tool-assets-world.ts'

const worlds: Awaited<ReturnType<typeof toolAssetsWorld>>[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})
async function open() {
  const world = await toolAssetsWorld()
  worlds.push(world)
  return world
}
it('publishes the actual Tool release and reads the exact held publication through Assets', async () => {
  const w = await open()
  await w.setup()
  expect(await w.capture()).toMatchObject({
    views: [
      {
        target: w.target,
        publicationRef: w.publication.publicationRef,
        definitionRef: {
          providerId: w.entry.governance.declaration.settings[0]?.providerId,
          version: w.entry.governance.declaration.reference.version,
          digest: canonicalDigest(w.entry.governance.declaration.settings[0]).slice(7),
        },
      },
    ],
  })
})
it('rejects a substituted body or version even when its Tool name is unchanged', async () => {
  const w = await open()
  const replaced = readBodyText('{"definition":"substituted"}', {
    maxBytes: 1000,
    maxDepth: 8,
    maxItems: 100,
    maxMembers: 100,
    maxStringLength: 100,
    maxNumberLength: 32,
  })
  if (replaced.kind !== 'ok') throw new Error('invalid test body')
  for (const pinned of [
    pinBody({ ...w.publication.pinned, body: replaced.value }),
    pinBody({ ...w.publication.pinned, version: 'unknown' }),
  ]) {
    expect(
      await w.owner.publish({
        operationId: `replace-${pinned.version}`,
        assetRef: w.publication.assetRef,
        pinned,
        expectedRevision: 0,
      }),
    ).toMatchObject({ kind: 'rejected', reason: 'invalid_input' })
  }
  expect(writeJsonText(w.publication.pinned.body)).toContain(w.entry.definition)
  await w.setup()
})
it('refuses foreign, missing, disabled and removed holdings', async () => {
  const w = await open()
  await w.setup()
  for (const target of [
    { ...w.target, scopeRef: 'tenant-b' },
    { ...w.target, targetRef: 'missing' },
  ])
    expect(await w.capture([target])).toMatchObject({ kind: 'rolled_back' })
  expect(
    await w.owner.changeHolding({
      operationId: 'disable',
      holdingRef: w.target.targetRef,
      scopeRef: w.target.scopeRef,
      expectedRevision: 1,
      change: { kind: 'setEnabled', enabled: false },
    }),
  ).toMatchObject({ kind: 'committed' })
  expect(await w.capture()).toMatchObject({ kind: 'rolled_back' })
  expect(
    await w.owner.changeHolding({
      operationId: 'remove',
      holdingRef: w.target.targetRef,
      scopeRef: w.target.scopeRef,
      expectedRevision: 2,
      change: { kind: 'remove' },
    }),
  ).toMatchObject({ kind: 'committed' })
  expect(await w.capture()).toMatchObject({ kind: 'rolled_back' })
})
it('retains the exact publication after closing and reopening the real database', async () => {
  const w = await open()
  await w.setup()
  const before = await w.capture()
  if (!('views' in before)) throw new Error(JSON.stringify(before))
  await w.close(false)
  const reopened = await toolAssetsWorld(w.root)
  worlds.push(reopened)
  const after = await reopened.capture()
  if (!('views' in after)) throw new Error(JSON.stringify(after))
  expect(after.views).toEqual(before.views)
})

it('joins actual Assets, standalone and immutable release facts in the real Worker', async () => {
  const w = await open()
  await w.setup()
  const current = await w.captureCurrent()
  expect(current).toMatchObject({
    targets: [
      {
        target: w.target,
        origin: w.entry.governance.declaration.origin,
        definition: w.entry.governance.declaration.settings[0],
        enabled: true,
      },
    ],
    enforcementBindings: expect.arrayContaining(w.entry.governance.declaration.enforcementBindings),
  })
  expect(
    await w.owner.changeHolding({
      operationId: 'disable-current',
      holdingRef: w.target.targetRef,
      scopeRef: w.target.scopeRef,
      expectedRevision: 1,
      change: { kind: 'setEnabled', enabled: false },
    }),
  ).toMatchObject({ kind: 'committed' })
  expect(await w.captureCurrent()).toMatchObject({ kind: 'rolled_back' })
})
it('cannot produce current evidence without each actual owner and support participant', async () => {
  const w = await open()
  await w.setup()
  for (const participant of [
    'assets.settings',
    'settings.target-projection',
    'harness.tool-permission-release',
    'harness.permission-support',
  ]) {
    expect(
      await w.captureCurrent(commands => {
        if (!commands.some(command => command.participant === participant))
          throw new Error(`unknown participant ${participant}`)
        return commands.filter(command => command.participant !== participant)
      }),
    ).toMatchObject({ kind: 'rejected_before_accept', reason: 'participant_dependency_missing' })
  }
})
