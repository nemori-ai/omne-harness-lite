import { createCategoryRegistry } from '@omne-harness/assets'
import { afterEach, expect, it } from 'vitest'
import { openCatalogWorld } from '../../settings-local/tests/catalog-world.ts'
import {
  assetsSqlMaterials,
  assetsSettingsProjectionCommand,
  createAssetsLocal,
} from '../src/index.ts'
import { categories, pinned, definition, definitionRef } from './world.ts'
const opened: Awaited<ReturnType<typeof open>>[] = []
async function open() {
  const w = await openCatalogWorld({
    assets: {
      materials: assetsSqlMaterials({ settingsGuard: false }),
      command: assetsSettingsProjectionCommand,
    },
  })
  const assets = createAssetsLocal({ ...w.terminalOptions, categories })
  expect(
    await assets.publish({
      operationId: 'publish',
      assetRef: 'asset-1',
      pinned: pinned(),
      expectedRevision: 0,
    }),
  ).toMatchObject({ kind: 'committed' })
  const target = { policyId: 'asset', targetRef: 'holding-1', scopeRef: w.change.target.scopeRef }
  expect(
    await assets.hold({
      operationId: 'hold',
      holdingRef: target.targetRef,
      scopeRef: target.scopeRef,
      assetRef: 'asset-1',
      selection: { kind: 'follow' },
      sourceIds: ['tenant'],
      grants: [{ sourceId: 'tenant', actions: ['set', 'clear', 'lock', 'unlock'] }],
    }),
  ).toMatchObject({ kind: 'committed' })
  w.registry.registerContribution(definition())
  return {
    ...w,
    assets,
    target,
    async close() {
      await assets.close()
      await w.close()
    },
  }
}
afterEach(async () => {
  for (const w of opened.splice(0)) await w.close()
})
it('uses one public application for standalone and real asset targets with real Identity', async () => {
  const w = await open()
  opened.push(w)
  const page = await w.service.queries.readCatalog(w.principal, {
    view: w.view,
    filter: '',
    locale: 'zh-CN',
    pageSize: 10,
    cursor: null,
  })
  expect(page).toMatchObject({
    kind: 'catalog',
    completeness: 'complete',
    entries: [{ target: { policyId: 'asset' } }, { target: { policyId: 'independent' } }],
  })
  const command = {
    ...w.change,
    operationId: 'asset-change',
    target: w.target,
    definitionRef: definitionRef(),
  }
  expect(await w.service.commands.change(w.principal, command)).toMatchObject({
    kind: 'committed',
    revision: 1,
  })
  expect(await w.service.commands.change(w.principal, w.change)).toMatchObject({
    kind: 'committed',
    revision: 1,
  })
  expect(
    await w.assets.changeHolding({
      operationId: 'remove',
      holdingRef: w.target.targetRef,
      scopeRef: w.target.scopeRef,
      expectedRevision: 1,
      change: { kind: 'remove' },
    }),
  ).toMatchObject({ kind: 'committed' })
  expect(
    await w.service.commands.change(w.principal, {
      ...command,
      operationId: 'late',
      expectedRevision: 1,
    }),
  ).toEqual({ kind: 'rejected', reason: 'forbidden' })
  expect(
    await w.service.commands.getOperation(w.principal, {
      target: w.target,
      operationId: command.operationId,
    }),
  ).toEqual({ kind: 'rejected', reason: 'forbidden' })
  expect(await w.remove()).toEqual({ kind: 'succeeded' })
  expect(
    await w.service.queries.readCatalog(w.principal, {
      view: w.view,
      filter: '',
      locale: 'zh-CN',
      pageSize: 10,
      cursor: null,
    }),
  ).toEqual({ kind: 'rejected', reason: 'forbidden' })
})
it('changes the actual selected asset definition and requires explicit re-adoption', async () => {
  const w = await open()
  opened.push(w)
  const command = {
    ...w.change,
    operationId: 'asset-change',
    target: w.target,
    definitionRef: definitionRef(),
  }
  expect(await w.service.commands.change(w.principal, command)).toMatchObject({ kind: 'committed' })
  expect(
    await w.assets.publish({
      operationId: 'v2',
      assetRef: 'asset-1',
      pinned: pinned('2', true),
      expectedRevision: 1,
    }),
  ).toMatchObject({ kind: 'committed' })
  w.registry.registerContribution(definition('2', true))
  expect(await w.service.queries.evaluate(w.principal, { ...w.view, targets: [w.target] })).toEqual(
    { kind: 'rejected', reason: 'definition_changed' },
  )
  expect(
    await w.maintenance.rebase({
      protocol: 'settings-rebase/1',
      requestId: 'rebase',
      operationId: 'rebase',
      target: w.target,
      from: definitionRef(),
      to: definitionRef('2', true),
      expectedRevision: 1,
      assignments: [{ sourceId: 'tenant', itemId: 'enabled', disposition: 'retain' }],
    }),
  ).toMatchObject({ kind: 'committed', revision: 2 })
  expect(
    await w.service.queries.evaluate(w.principal, { ...w.view, targets: [w.target] }),
  ).toMatchObject({ kind: 'complete', entries: [{ definitionRef: { version: '2' }, revision: 2 }] })
})
it('omits legitimately undeclared assets from management without denying unrelated settings', async () => {
  const w = await open()
  opened.push(w)
  const registry = createCategoryRegistry()
  registry.register({
    category: 'service',
    schema: { kind: 'null' },
    judge: () => ({ ok: true }),
    deriveDeclarations: () => ({ entries: [] }),
    references: () => [],
  })
  const owner = createAssetsLocal({ ...w.terminalOptions, categories: registry })
  try {
    expect(
      await owner.publish({
        operationId: 'plain-publish',
        assetRef: 'plain',
        pinned: pinned('1', false, 'plain'),
        expectedRevision: 0,
      }),
    ).toMatchObject({ kind: 'committed' })
    expect(
      await owner.hold({
        operationId: 'plain-hold',
        assetRef: 'plain',
        holdingRef: 'plain',
        scopeRef: w.target.scopeRef,
        selection: { kind: 'follow' },
        sourceIds: ['tenant'],
        grants: [],
      }),
    ).toMatchObject({ kind: 'committed' })
    const page = await w.service.queries.readCatalog(w.principal, {
      view: w.view,
      filter: '',
      locale: 'zh-CN',
      pageSize: 10,
      cursor: null,
    })
    expect(page).toMatchObject({ kind: 'catalog', completeness: 'complete' })
    if (page.kind === 'catalog') expect(page.entries).toHaveLength(2)
    expect(
      await w.service.queries.evaluate(w.principal, {
        ...w.view,
        targets: [{ ...w.target, targetRef: 'plain' }],
      }),
    ).toEqual({ kind: 'rejected', reason: 'forbidden' })
  } finally {
    await owner.close()
  }
})
