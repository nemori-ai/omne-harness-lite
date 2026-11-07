import { createCategoryRegistry } from '@omne-harness/assets'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import { assetsPublicationCommand, AssetsPublicationProjectionSchema } from '../src/index.ts'
import { digest } from '../src/encoding.ts'
import { openWorld, pinned, target, definition, type World } from './world.ts'
const worlds: World[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})
async function capture(w: World, targets = [target]) {
  const captureId = randomUUID()
  const result = await w.storage.commit({
    identity: {
      ...w.domain,
      operation: 'test.publication',
      protocolVersion: '2',
      operationKey: captureId,
    },
    combinationVersion: w.combination.combinationVersion,
    manifestDigest: w.combination.manifestDigest,
    commands: [
      assetsPublicationCommand({
        domain: w.domain,
        principalRef: 'alice',
        captureId,
        request: { deploymentRef: 'test', mode: 'runtime', targets, selectionRef: null },
      }),
    ],
  })
  return result.kind === 'committed'
    ? AssetsPublicationProjectionSchema.parse(result.responses[0]?.reply.response)
    : result
}
it('follows the selected publication even when Settings are identical while pinned holdings stay fixed', async () => {
  const fixedDefinitions = createCategoryRegistry()
  fixedDefinitions.register({
    category: 'service',
    schema: { kind: 'null' },
    judge: () => ({ ok: true }),
    deriveDeclarations: () => ({ entries: [] }),
    references: () => [],
    settings: () => definition('1'),
  })
  const w = await openWorld({ categories: fixedDefinitions })
  worlds.push(w)
  await w.setup()
  const first = await capture(w)
  expect(first).toMatchObject({
    views: [
      {
        target,
        publicationRef: { assetRef: 'asset-a', version: '1', bodyDigest: digest(pinned().body) },
      },
    ],
  })
  expect(
    await w.owner.publish({
      operationId: 'publish-2',
      assetRef: 'asset-a',
      pinned: pinned('2'),
      expectedRevision: 1,
    }),
  ).toMatchObject({ kind: 'committed' })
  const second = await capture(w)
  if (!('views' in first) || !('views' in second)) throw new Error('missing projection')
  expect(second.views[0]?.definitionRef).toEqual(first.views[0]?.definitionRef)
  expect(second.views[0]?.publicationRef.version).toBe('2')
  expect(second.views[0]?.ownerRevision).toBeGreaterThan(first.views[0]!.ownerRevision)
  expect(
    await w.owner.changeHolding({
      operationId: 'pin',
      holdingRef: target.targetRef,
      scopeRef: target.scopeRef,
      expectedRevision: 1,
      change: { kind: 'selectVersion', selection: { kind: 'pinned', version: '1' } },
    }),
  ).toMatchObject({ kind: 'committed' })
  const fixed = await capture(w)
  expect(fixed).toMatchObject({ views: [{ publicationRef: { version: '1' } }] })
  expect(
    await w.owner.publish({
      operationId: 'publish-3',
      assetRef: 'asset-a',
      pinned: pinned('3'),
      expectedRevision: 2,
    }),
  ).toMatchObject({ kind: 'committed' })
  const afterPublish = await capture(w)
  if (!('views' in fixed) || !('views' in afterPublish))
    throw new Error('missing pinned projection')
  expect(afterPublish.views).toEqual(fixed.views)
  await w.close()
  const reopened = await openWorld({ root: w.root, categories: fixedDefinitions })
  worlds.push(reopened)
  const recovered = await capture(reopened)
  if (!('views' in recovered)) throw new Error('missing reopened projection')
  expect(recovered.views).toEqual(fixed.views)
})
it('refuses missing, foreign and disabled runtime targets', async () => {
  const w = await openWorld()
  worlds.push(w)
  await w.setup()
  expect(await capture(w, [target, target])).toMatchObject({ kind: 'rolled_back' })
  expect(await capture(w, [{ ...target, targetRef: 'missing' }])).toMatchObject({
    kind: 'rolled_back',
  })
  expect(await capture(w, [{ ...target, scopeRef: 'foreign' }])).toMatchObject({
    kind: 'rolled_back',
  })
  expect(
    await w.owner.changeHolding({
      operationId: 'disable',
      holdingRef: target.targetRef,
      scopeRef: target.scopeRef,
      expectedRevision: 1,
      change: { kind: 'setEnabled', enabled: false },
    }),
  ).toMatchObject({ kind: 'committed' })
  expect(await capture(w)).toMatchObject({ kind: 'rolled_back' })
})
