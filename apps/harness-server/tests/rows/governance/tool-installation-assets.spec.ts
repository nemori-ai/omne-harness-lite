// @module-tag slow
import { afterEach, expect, it } from 'vitest'
import { toolAssetsWorld } from './tool-assets-world.ts'
import { installToolAsset } from '../../../src/rows/governance/tool-installation-assets.ts'

const worlds: Awaited<ReturnType<typeof toolAssetsWorld>>[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

it('installs the actual released Tool through Assets and preserves its holding on repeat', async () => {
  const w = await toolAssetsWorld()
  worlds.push(w)
  const input = { owner: w.owner, tenantRef: w.domain.scope.tenant, entry: w.entry }
  const installed = await installToolAsset(input)
  expect(installed).toMatchObject({ kind: 'ready' })
  if (installed.kind !== 'ready') throw new Error(JSON.stringify(installed))
  const target = installed.target
  const holding = await w.owner.readHolding({
    holdingRef: target.targetRef,
    scopeRef: target.scopeRef,
  })
  expect(holding).toMatchObject({
    kind: 'holding',
    holding: { assetRef: 'harness.tool.Shell', state: 'held', enabled: true, revision: 1 },
    selected: {
      version: w.publication.pinned.version,
      definition: w.entry.governance.declaration.settings[0],
    },
  })
  expect(await installToolAsset(input)).toEqual(installed)
  expect(
    await w.owner.readHolding({ holdingRef: target.targetRef, scopeRef: target.scopeRef }),
  ).toEqual(holding)
  expect(
    await w.owner.changeHolding({
      operationId: 'user-disable',
      holdingRef: target.targetRef,
      scopeRef: target.scopeRef,
      expectedRevision: 1,
      change: { kind: 'setEnabled', enabled: false },
    }),
  ).toMatchObject({ kind: 'committed' })
  expect(await installToolAsset(input)).toEqual({ kind: 'inactive', target })
  expect(
    await w.owner.readHolding({ holdingRef: target.targetRef, scopeRef: target.scopeRef }),
  ).toMatchObject({
    kind: 'holding',
    holding: { enabled: false, revision: 2 },
  })
})

it('coalesces concurrent installation through original receipts and retains removed holdings', async () => {
  const w = await toolAssetsWorld()
  worlds.push(w)
  const input = { owner: w.owner, tenantRef: w.domain.scope.tenant, entry: w.entry }
  const [first, second] = await Promise.all([installToolAsset(input), installToolAsset(input)])
  expect(first).toMatchObject({ kind: 'ready' })
  expect(second).toEqual(first)
  if (first.kind !== 'ready') throw new Error(JSON.stringify(first))
  const lookup = { holdingRef: first.target.targetRef, scopeRef: first.target.scopeRef }
  expect(
    await w.owner.changeHolding({
      ...lookup,
      operationId: 'user-remove',
      expectedRevision: 1,
      change: { kind: 'remove' },
    }),
  ).toMatchObject({ kind: 'committed' })
  expect(await installToolAsset(input)).toEqual({ kind: 'inactive', target: first.target })
  expect(await w.owner.readHolding(lookup)).toMatchObject({
    kind: 'holding',
    holding: { state: 'removed', revision: 2 },
    selected: null,
  })
})

it('recognizes the actual publication and holding after their replies are lost', async () => {
  const w = await toolAssetsWorld()
  worlds.push(w)
  const owner: typeof w.owner = {
    ...w.owner,
    async publish(input) {
      const result = await w.owner.publish(input)
      expect(result.kind).toBe('committed')
      return { kind: 'unknown', operationId: input.operationId }
    },
    async hold(input) {
      const result = await w.owner.hold(input)
      expect(result.kind).toBe('committed')
      return { kind: 'unknown', operationId: input.operationId }
    },
  }
  const input = { owner, tenantRef: w.domain.scope.tenant, entry: w.entry }
  const result = await installToolAsset(input)
  expect(result).toMatchObject({ kind: 'ready' })
  expect(await installToolAsset(input)).toEqual(result)
})
