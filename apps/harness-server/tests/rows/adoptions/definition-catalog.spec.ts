import { readFileSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import { agentDefinitionCategoryPlugin } from '@omne-harness/agent-host-local/cordis'
import { assetCategoriesPlugin } from '@omne-harness/assets-cordis-contract/cordis'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import type { HeldHolding } from '@omne-harness/assets'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { expect, it } from 'vitest'
import { agentAdoptionsConfig } from '../../../src/rows/agent-adoptions/config.ts'
import { agentDefinitionCatalogKey } from '../../../src/rows/agent-adoptions/definition-catalog.ts'
import { agentAdoptionsRow } from '../../../src/rows/agent-adoptions/index.ts'
import { heldOnRegistry } from '../../../src/rows/tenant-assets/held.ts'
import { provideTenantAssets } from '../../../src/rows/tenant-assets/service.ts'
import { fixtureTenant } from '../../entry/support.ts'
import { mappingConfig } from './support.ts'

function releaseConfig(): unknown {
  const distribution = JSON.parse(
    readFileSync(new URL('../../../config/serve.distribution.json', import.meta.url), 'utf8'),
  ) as { rows: readonly { id: string; config: unknown }[] }
  return distribution.rows.find(row => row.id === 'agent-adoptions')?.config
}

const refOf = (tenant: TenantId): string => {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('tenant')
  return encoded.value
}

type Tree = Readonly<{
  /** Leaves out the registry, the categories and the tenant assets. */
  bare?: boolean
  /** What each tenant holds when its assets are opened, by tenant text. */
  holds?: Readonly<Record<string, readonly HeldHolding[]>>
  /** Tenants whose assets cannot be opened. */
  closed?: readonly string[]
  /** Tenants whose store could not tell what it holds. */
  missed?: readonly string[]
}>

/** The tenant assets as the row gives them, over a store that holds what the case says. */
const tenantAssets = (options: Tree) => ({
  name: 'tenant-assets',
  inject: ['assetCategories'],
  apply(ctx: Context) {
    const held = heldOnRegistry(
      () => ctx.assetCategories,
      () => undefined,
    )
    ctx.on('dynamis-cordis/changed', () => held.registryChanged())
    const store = { listHeld: async () => ({ kind: 'page', items: [], next: null }) } as never
    const opened = new Set<string>()
    const open = async (ref: string) => {
      if (options.closed?.includes(ref)) return undefined
      if (opened.has(ref)) return store
      opened.add(ref)
      const port = held.heldOf(ref)
      if (options.missed?.includes(ref)) port.missed('unread')
      else port.sync(options.holds?.[ref] ?? [])
      return store
    }
    provideTenantAssets(ctx, {
      open,
      standing: async () => 'registered',
      layerSources: held.sourcesOf(open),
    })
  },
})

/** The row on a tree with the registry, the categories and the tenant assets, as the release has them. */
async function treeOf(config: unknown, options: Tree = {}) {
  const ctx = new Context()
  const rest = async () => {
    await ctx.plugin(DynamisService)
    await ctx.plugin(assetCategoriesPlugin)
    await ctx.plugin(tenantAssets(options))
    await new Promise<void>(resolve => setImmediate(resolve))
  }
  if (options.bare !== true) await rest()
  await ctx.plugin(agentAdoptionsRow, agentAdoptionsConfig.parse(config))
  await new Promise<void>(resolve => setImmediate(resolve))
  const catalog = ctx.get(agentDefinitionCatalogKey)
  if (catalog === undefined) throw new Error('the row does not provide the catalog')
  return { ctx, catalog, rest }
}

const catalogOf = async (config: unknown) => (await treeOf(config)).catalog

it('lists the definitions of the release to a tenant, each with its name, type and summary', async () => {
  const catalog = await catalogOf(releaseConfig())
  expect(await catalog.visibleTo(fixtureTenant('a'))).toEqual([
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
  const listed = (await catalog.visibleTo(fixtureTenant('b'))) ?? []
  expect(listed.length).toBeGreaterThan(0)
  for (const entry of listed) {
    expect(Object.keys(entry).sort()).toEqual(['name', 'summary', 'type'])
    expect(Object.isFrozen(entry)).toBe(true)
  }
  expect(listed.map(entry => entry.name)).toEqual(
    (mappingConfig() as { mappings: readonly { name: string }[] }).mappings.map(item => item.name),
  )
})

it('does not know what a tenant sees while the categories and the assets are not there, and knows once they are', async () => {
  const { catalog, rest } = await treeOf(mappingConfig(), { bare: true })
  expect(await catalog.visibleTo(fixtureTenant('a'))).toBeUndefined()
  await rest()
  expect((await catalog.visibleTo(fixtureTenant('a')))?.length).toBeGreaterThan(0)
})

it('does not know while two plugins register the category, and knows again when one leaves', async () => {
  const { ctx, catalog } = await treeOf(mappingConfig())
  const rival = ctx.plugin({ ...agentDefinitionCategoryPlugin, name: 'agent-definition-rival' })
  await rival.await()
  expect(await catalog.visibleTo(fixtureTenant('a'))).toBeUndefined()
  await rival.dispose()
  expect((await catalog.visibleTo(fixtureTenant('a')))?.length).toBeGreaterThan(0)
})

it('does not know what a tenant sees when its assets cannot be opened, or could not tell what they hold', async () => {
  const a = refOf(fixtureTenant('a'))
  const closed = await treeOf(mappingConfig(), { closed: [a] })
  expect(await closed.catalog.visibleTo(fixtureTenant('a'))).toBeUndefined()
  expect((await closed.catalog.visibleTo(fixtureTenant('b')))?.length).toBeGreaterThan(0)
  const missed = await treeOf(mappingConfig(), { missed: [a] })
  expect(await missed.catalog.visibleTo(fixtureTenant('a'))).toBeUndefined()
  expect((await missed.catalog.visibleTo(fixtureTenant('b')))?.length).toBeGreaterThan(0)
})

it('a definition a tenant holds over the official one is not the official one to it, from the first question on', async () => {
  const [first] = (mappingConfig() as { mappings: readonly { name: string }[] }).mappings
  if (first === undefined) throw new Error('the table lists nothing')
  const mine = {
    asset: 'tenant/AgentDefinition/own',
    version: 'v1',
    disabled: false,
    immutable: false,
    replaceLocked: false,
  }
  const holds = {
    [refOf(fixtureTenant('a'))]: [{ category: 'AgentDefinition', name: first.name, item: mine }],
  }
  const { catalog } = await treeOf(mappingConfig(), { holds })
  const seenByA = (await catalog.visibleTo(fixtureTenant('a')))?.map(entry => entry.name)
  expect(seenByA).not.toContain(first.name)
  expect(seenByA).toBeDefined()
  const seenByB = (await catalog.visibleTo(fixtureTenant('b')))?.map(entry => entry.name)
  expect(seenByB).toContain(first.name)
})
