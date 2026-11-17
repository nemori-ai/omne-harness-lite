import { createCategoryPoint } from '@omne-harness/assets'
import { afterEach, expect, it } from 'vitest'
import {
  assetsSettingsProjectionCommand,
  assetsSqlMaterials,
  createAssetsLocal,
} from '../src/index.ts'
import { ownerSources } from './sources.ts'
import { definition, definitionRef, pinned, service } from './world.ts'
const { openCatalogWorld } = (await import(
  new URL('../tests/catalog-world.ts', import.meta.resolve('@omne-harness/settings-local')).href
)) as typeof import('../../settings-local/tests/catalog-world.ts')

const closing: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of closing.splice(0)) await close()
})

async function open() {
  const categories = createCategoryPoint()
  const w = await openCatalogWorld({
    assets: {
      materials: assetsSqlMaterials(),
      command: binding => assetsSettingsProjectionCommand(binding, { excluded: [] }),
    },
  })
  const assets = createAssetsLocal({ ...w.terminalOptions, categories })
  closing.push(async () => {
    await assets.close()
    await w.close()
  })
  w.registry.registerContribution(definition())
  const target = { policyId: 'asset', targetRef: 'holding-1', scopeRef: w.change.target.scopeRef }
  const publish = (operationId: string, version = '1', expectedRevision = 0) =>
    assets.publish({ operationId, assetRef: 'asset-1', pinned: pinned(version), expectedRevision })
  const hold = () =>
    assets.hold({
      operationId: 'hold',
      holdingRef: target.targetRef,
      scopeRef: target.scopeRef,
      assetRef: 'asset-1',
      selection: { kind: 'follow' },
      sources: ownerSources('tenant'),
      grants: [{ sourceId: 'tenant', actions: ['set', 'clear', 'lock', 'unlock'] }],
    })
  const catalog = async () => {
    const page = await w.service.queries.readCatalog(w.principal, {
      view: w.view,
      filter: '',
      locale: 'zh-CN',
      pageSize: 10,
      cursor: null,
    })
    return page.kind === 'catalog' ? page.entries : page
  }
  return { ...w, categories, assets, target, publish, hold, catalog }
}

it('takes the category at each use: one contributed after the store was built publishes, holds and lists', async () => {
  const w = await open()
  expect(await w.publish('before')).toEqual({ kind: 'rejected', reason: 'unknown_category' })
  w.categories.contribute(service)
  expect(await w.publish('after')).toMatchObject({ kind: 'committed' })
  expect(await w.hold()).toMatchObject({ kind: 'committed' })
  expect(await w.catalog()).toEqual(
    expect.arrayContaining([expect.objectContaining({ target: w.target })]),
  )
})

it('withdrawing the category leaves holdings, versions and setting values as they were', async () => {
  const w = await open()
  const withdraw = w.categories.contribute(service)
  expect(await w.publish('publish')).toMatchObject({ kind: 'committed' })
  expect(await w.hold()).toMatchObject({ kind: 'committed' })
  expect(
    await w.write(w.principal, {
      ...w.change,
      operationId: 'asset-change',
      target: w.target,
      definitionRef: definitionRef(),
    }),
  ).toMatchObject({ kind: 'committed', revision: 1 })
  const facts = async () => ({
    asset: await w.assets.readAsset({ assetRef: 'asset-1' }),
    version: await w.assets.readVersion({ assetRef: 'asset-1', version: '1' }),
    holding: await w.assets.readHolding({
      holdingRef: w.target.targetRef,
      scopeRef: w.target.scopeRef,
    }),
    catalog: await w.catalog(),
  })
  const before = await facts()
  expect(before.catalog).toEqual(
    expect.arrayContaining([expect.objectContaining({ target: w.target, revision: 1 })]),
  )

  withdraw()
  expect(await facts()).toEqual(before)
  expect(await w.publish('while-withdrawn', '2', 1)).toEqual({
    kind: 'rejected',
    reason: 'unknown_category',
  })

  w.categories.contribute(service)
  expect(await facts()).toEqual(before)
})
