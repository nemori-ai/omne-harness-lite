import { readFileSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import { agentDefinitionCategoryPlugin } from '@omne-harness/agent-host-local/cordis'
import { assetCategoriesPlugin } from '@omne-harness/assets-cordis-contract/cordis'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { expect, it } from 'vitest'
import { agentAdoptionsConfig } from '../../../src/rows/agent-adoptions/config.ts'
import { agentDefinitionCatalogKey } from '../../../src/rows/agent-adoptions/definition-catalog.ts'
import { agentAdoptionsRow } from '../../../src/rows/agent-adoptions/index.ts'
import { fixtureTenant } from '../../entry/support.ts'
import { mappingConfig } from './support.ts'

function releaseConfig(): unknown {
  const distribution = JSON.parse(
    readFileSync(new URL('../../../config/serve.distribution.json', import.meta.url), 'utf8'),
  ) as { rows: readonly { id: string; config: unknown }[] }
  return distribution.rows.find(row => row.id === 'agent-adoptions')?.config
}

/** The row on a tree with the registry and the categories, as the release has them; `bare` leaves both out. */
async function treeOf(config: unknown, bare = false) {
  const ctx = new Context()
  if (!bare) {
    await ctx.plugin(DynamisService)
    await ctx.plugin(assetCategoriesPlugin)
  }
  await ctx.plugin(agentAdoptionsRow, agentAdoptionsConfig.parse(config))
  await new Promise<void>(resolve => setImmediate(resolve))
  const catalog = ctx.get(agentDefinitionCatalogKey)
  if (catalog === undefined) throw new Error('the row does not provide the catalog')
  return { ctx, catalog }
}

const catalogOf = async (config: unknown) => (await treeOf(config)).catalog

const refOf = (tenant: TenantId): string => {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('tenant')
  return encoded.value
}

it('lists the definitions of the release to a tenant, each with its name, type and summary', async () => {
  const catalog = await catalogOf(releaseConfig())
  expect(catalog.visibleTo(fixtureTenant('a'))).toEqual([
    {
      name: 'assistant',
      type: 'non-master',
      summary: expect.stringMatching(/^A general assistant without tools\./u),
    },
    {
      name: 'coding',
      type: 'master',
      summary: expect.stringMatching(/^A coding agent with the full tool set/u),
    },
  ])
})

it('gives each entry nothing but the three members, frozen, in the order of the table', async () => {
  const catalog = await catalogOf(mappingConfig())
  const listed = catalog.visibleTo(fixtureTenant('b')) ?? []
  expect(listed.length).toBeGreaterThan(0)
  for (const entry of listed) {
    expect(Object.keys(entry).sort()).toEqual(['name', 'summary', 'type'])
    expect(Object.isFrozen(entry)).toBe(true)
  }
  expect(listed.map(entry => entry.name)).toEqual(
    (mappingConfig() as { mappings: readonly { name: string }[] }).mappings.map(item => item.name),
  )
})

it('does not know what a tenant sees while the categories are not there, and knows once they are', async () => {
  const { ctx, catalog } = await treeOf(mappingConfig(), true)
  expect(catalog.visibleTo(fixtureTenant('a'))).toBeUndefined()
  await ctx.plugin(DynamisService)
  await ctx.plugin(assetCategoriesPlugin)
  await new Promise<void>(resolve => setImmediate(resolve))
  expect(catalog.visibleTo(fixtureTenant('a'))?.length).toBeGreaterThan(0)
})

it('does not know while two plugins register the category, and knows again when one leaves', async () => {
  const { ctx, catalog } = await treeOf(mappingConfig())
  const rival = ctx.plugin({ ...agentDefinitionCategoryPlugin, name: 'agent-definition-rival' })
  await rival.await()
  expect(catalog.visibleTo(fixtureTenant('a'))).toBeUndefined()
  await rival.dispose()
  expect(catalog.visibleTo(fixtureTenant('a'))?.length).toBeGreaterThan(0)
})

it('reads the point as the tenant: a definition a tenant holds over the official one is not the official one to it', async () => {
  const { ctx, catalog } = await treeOf(mappingConfig())
  const [first] = catalog.visibleTo(fixtureTenant('a')) ?? []
  if (first === undefined) throw new Error('the table lists nothing')
  const mine = {
    asset: 'tenant/AgentDefinition/own',
    version: 'v1',
    disabled: false,
    immutable: false,
    replaceLocked: false,
  }
  await ctx.plugin({
    name: 'tenant-assets',
    inject: ['assetCategories'],
    apply(inner: Context) {
      const sync = inner.assetCategories.holdingsOf(refOf(fixtureTenant('a')), () => undefined)
      sync([{ category: 'AgentDefinition', name: first.name, item: mine }])
    },
  })
  const seenByA = catalog.visibleTo(fixtureTenant('a'))?.map(entry => entry.name)
  expect(seenByA).not.toContain(first.name)
  expect(catalog.visibleTo(fixtureTenant('b'))?.map(entry => entry.name)).toContain(first.name)
})
