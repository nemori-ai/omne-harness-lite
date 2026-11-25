// @module-tag slow
import { describe, expect, it } from 'vitest'
import type { TenantId } from '@omne-harness/legal-identity'
import { settledSession } from '../../governance/tenant-settings-support.ts'
import { savedTenant } from '../../r9/support.ts'
import { tenantOf, type ProtocolClients } from '../../support/protocol-clients.ts'
import {
  onReleaseTree,
  pollUntil,
  toolCallsThenText,
  type ReleaseTree,
} from '../../support/release-tree.ts'

type Assets = ProtocolClients['assets']
const OPENROUTER = { kind: 'asset', category: 'model-provider', name: 'openrouter' } as const

async function credentialOf(tree: ReleaseTree): Promise<readonly string[]> {
  const listed = await pollUntil(
    'model/v1 to answer',
    async () => {
      const ran = await tree.cli(['list-models'])
      return JSON.parse(ran.stdout || '{}') as {
        outcome?: string
        body?: { models?: Array<{ route: string; credential: string }> }
      }
    },
    printed => printed.outcome !== undefined,
  )
  return [...new Set((listed.body?.models ?? []).map(model => model.credential))]
}

async function settingsOf(assets: Assets, tenant: TenantId) {
  const listed = await assets['list-settings']({
    tenant,
    scope: { kind: 'asset', asset: { category: 'model-provider', name: 'openrouter' } },
    after: null,
    limit: 100,
  })
  if (listed.outcome !== 'succeeded') throw new Error(`settings: ${listed.outcome}`)
  return listed.body.items
}

describe('the release installs its model provider into each tenant (C3)', () => {
  it(
    'OpenRouter is the tenant’s official holding; its key is still one item, and a key the tenant sets is the one Model reads',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        await settledSession(tree, 'hello')
        const assets = tree.clients.assets
        const tenant = tenantOf(savedTenant(tree.home))

        // Reading the settings opens the tenant's governance, which installs what the release brings.
        expect(
          (await settingsOf(assets, tenant)).map(item => [item.item, item.kind, item.own]),
        ).toEqual([
          ['apiKey', 'secret', 'unset'],
          ['model-reasoning-efforts', expect.anything(), expect.anything()],
          ['model-switches', expect.anything(), expect.anything()],
        ])
        const listed = await assets['list-assets']({
          tenant,
          category: 'model-provider',
          after: null,
          limit: 10,
        })
        if (listed.outcome !== 'succeeded') throw new Error(`list: ${listed.outcome}`)
        expect(listed.body.items.map(row => [row.name, row.origin, row.holding])).toEqual([
          ['openrouter', 'official', 'harness.preinstalled.model-provider.openrouter'],
        ])

        expect(
          (await settingsOf(assets, tenant)).map(item => [item.item, item.kind, item.own]),
        ).toEqual([
          ['apiKey', 'secret', 'unset'],
          ['model-reasoning-efforts', expect.anything(), expect.anything()],
          ['model-switches', expect.anything(), expect.anything()],
        ])

        const written = await assets['set-setting']({
          tenant,
          owner: OPENROUTER,
          item: 'apiKey',
          operation: 'tenant-key',
          expectedRevision: '0',
          value: { kind: 'secret', secret: 'sk-or-tenant-installation' },
        })
        expect(written).toMatchObject({ outcome: 'succeeded' })
        expect(
          (await settingsOf(assets, tenant)).map(item => [item.item, item.kind, item.own]),
        ).toEqual([
          ['apiKey', 'secret', 'available'],
          ['model-reasoning-efforts', expect.anything(), expect.anything()],
          ['model-switches', expect.anything(), expect.anything()],
        ])
        expect(await credentialOf(tree)).toEqual(['available'])
        const before = tree.modelAuthorizations().length
        await settledSession(tree, 'with the tenant key')
        const sent = tree.modelAuthorizations().slice(before)
        expect(sent.length).toBeGreaterThan(0)
        expect(new Set(sent)).toEqual(new Set(['Bearer sk-or-tenant-installation']))
      })
      expect(exitCode).toBe(0)
    },
  )
})
