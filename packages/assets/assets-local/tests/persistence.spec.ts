import { ownerSources } from './sources.ts'
import { afterEach, expect, it } from 'vitest'
import { openWorld, pinned, grants, target, type World } from './world.ts'
const worlds: World[] = []
async function open(options: Parameters<typeof openWorld>[0] = {}) {
  const world = await openWorld(options)
  worlds.push(world)
  return world
}
afterEach(async () => {
  await Promise.all(worlds.splice(0).map(world => world.close()))
})
it('persists immutable body, selected holding and original operation across provider reopen', async () => {
  const first = await open()
  await first.setup()
  expect(
    await first.owner.readHolding({ holdingRef: target.targetRef, scopeRef: target.scopeRef }),
  ).toMatchObject({
    kind: 'holding',
    holding: { state: 'held', revision: 1 },
    selected: { version: '1', definitionRef: { version: '1' } },
  })
  await first.close()
  const second = await open({ root: first.root })
  expect(await second.owner.readVersion({ assetRef: 'asset-a', version: '1' })).toMatchObject({
    kind: 'version',
    version: { body: pinned().body },
  })
  expect(await second.owner.getOperation('hold-1')).toEqual({
    kind: 'committed',
    operationId: 'hold-1',
    revision: 1,
    changed: true,
  })
  expect(
    await second.owner.hold({
      operationId: 'hold-1',
      holdingRef: target.targetRef,
      scopeRef: target.scopeRef,
      assetRef: 'asset-a',
      selection: { kind: 'follow' },
      sources: ownerSources('tenant'),
      grants,
    }),
  ).toEqual({ kind: 'committed', operationId: 'hold-1', revision: 1, changed: true })
})
