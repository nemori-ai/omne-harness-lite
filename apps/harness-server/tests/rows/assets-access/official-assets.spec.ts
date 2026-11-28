import { describe, expect, it } from 'vitest'
import type { TenantId } from '@omne-harness/legal-identity'
import { settledSession } from '../../governance/tenant-settings-support.ts'
import { savedTenant } from '../../r9/support.ts'
import { tenantOf, type ProtocolClients } from '../../support/protocol-clients.ts'
import { onReleaseTree, toolCallsThenText } from '../../support/release-tree.ts'

type Assets = ProtocolClients['assets']

/** Every row a tenant sees in a category, page after page, two at a time so the official part spans pages. */
async function everyRow(assets: Assets, tenant: TenantId, category: string) {
  const rows: Array<{ name: string; origin: string; enabled: boolean; holding: string }> = []
  let after: string | null = null
  for (let page = 0; page < 100; page += 1) {
    const listed = await assets['list-assets']({ tenant, category, after, limit: 2 })
    if (listed.outcome !== 'succeeded') throw new Error(`${category}: ${listed.outcome}`)
    rows.push(...listed.body.items)
    if (listed.body.next === null) return rows
    after = listed.body.next
  }
  throw new Error(`${category}: the list does not end`)
}

describe('assets/v1 lists the official assets every tenant holds', () => {
  it(
    'each category lists what the release brings once; OpenRouter is there with its key item; official ones cannot be disabled or removed',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        await settledSession(tree, 'hello')
        const assets = tree.clients.assets
        const tenant = tenantOf(savedTenant(tree.home))

        const providers = await everyRow(assets, tenant, 'model-provider')
        expect(providers.map(row => [row.name, row.origin, row.enabled])).toEqual([
          ['openai', 'official', true],
          ['openrouter', 'official', true],
        ])
        const converters = await everyRow(assets, tenant, 'converter')
        expect(converters.map(row => [row.name, row.origin])).toEqual([
          ['application-pdf', 'official'],
          ['voice', 'official'],
        ])
        const agents = await everyRow(assets, tenant, 'AgentDefinition')
        expect(agents.length).toBeGreaterThan(0)
        expect(agents.every(row => row.origin === 'official')).toBe(true)
        const tools = await everyRow(assets, tenant, 'tool')
        const toolNames = tools.map(row => row.name)
        expect(toolNames).toContain('Shell')
        expect(new Set(toolNames).size).toBe(toolNames.length)
        expect(tools.every(row => row.origin === 'official')).toBe(true)

        const openrouter = await assets['describe-asset']({
          tenant,
          category: 'model-provider',
          name: 'openrouter',
        })
        expect(openrouter).toMatchObject({
          outcome: 'succeeded',
          body: { item: { origin: 'official' }, content: { kind: 'data' }, settings: true },
        })
        const keyItems = await assets['list-settings']({
          tenant,
          scope: { kind: 'asset', asset: { category: 'model-provider', name: 'openrouter' } },
          after: null,
          limit: 100,
        })
        if (keyItems.outcome !== 'succeeded') throw new Error(`settings: ${keyItems.outcome}`)
        expect(keyItems.body.items.map(item => [item.item, item.kind, item.own])).toEqual([
          ['apiKey', 'secret', 'unset'],
          ['model-reasoning-efforts', expect.anything(), expect.anything()],
          ['model-switches', expect.anything(), expect.anything()],
        ])

        const provider = providers.find(row => row.name === 'openrouter')
        if (provider === undefined) throw new Error('no provider row')
        expect(
          await assets['set-asset-enabled']({
            tenant,
            operation: 'disable-openrouter',
            holding: provider.holding,
            enabled: false,
          }),
        ).toMatchObject({ outcome: 'not-writable', body: { reason: 'official' } })
        expect(
          await assets['remove-asset']({
            tenant,
            operation: 'remove-openrouter',
            holding: provider.holding,
          }),
        ).toMatchObject({ outcome: 'not-writable', body: { reason: 'official' } })
      })
      expect(exitCode).toBe(0)
    },
  )
})
