import { describe, expect, it } from 'vitest'
import { scopeOfLayer, type HeldItem } from '@omne-harness/assets'
import { officialAssetRef } from '../../../src/assets/official-holdings.ts'
import { candidates } from '@omne-harness/dynamis'
import type { TenantId } from '@omne-harness/legal-identity'
import { settledSession } from '../../governance/tenant-settings-support.ts'
import { savedTenant } from '../../r9/support.ts'
import { tenantOf, type ProtocolClients } from '../../support/protocol-clients.ts'
import {
  onReleaseTree,
  onReleaseTreeRuns,
  toolCallsThenText,
  type ReleaseTree,
} from '../../support/release-tree.ts'

type Assets = ProtocolClients['assets']

const SKILL = `---
name: review
description: Reviews a change before it is merged.
---

Read the change, then say what is wrong with it.
`

const POINTS: Readonly<Record<string, string>> = {
  AgentDefinition: 'agent.definitions',
  converter: 'media.converters',
  'model-provider': 'model.providers',
  skill: 'skill.skills',
  tool: 'tool.tools',
}

async function upload(assets: Assets, tenant: TenantId, operation: string) {
  const bytes = new TextEncoder().encode(SKILL)
  const begun = await assets['begin-asset-upload']({
    tenant,
    operation,
    category: 'skill',
    name: 'review',
    manifest: [{ path: 'SKILL.md', bytes: bytes.length }],
  })
  if (begun.outcome !== 'succeeded') throw new Error(`begin: ${begun.outcome}`)
  const sent = await assets['append-asset-upload']({
    tenant,
    upload: operation,
    path: 'SKILL.md',
    offset: 0,
    bytes,
  })
  if (sent.outcome !== 'succeeded') throw new Error(`append: ${sent.outcome}`)
  const made = await assets['commit-asset-upload']({ tenant, upload: operation })
  if (made.outcome !== 'succeeded') throw new Error(`commit: ${made.outcome}`)
  return made.body
}

/** The entries one asker sees on the point of a category, as key and item, at scopes below the deployment. */
function heldOn(tree: ReleaseTree, category: string, asker: readonly string[]) {
  const registry = tree.scope.get('dynamis')?.registry()
  if (registry === undefined) throw new Error('the tree has no registry')
  const read = candidates<HeldItem>(registry, POINTS[category] as string, null, asker)
  if (read.kind !== 'read') throw new Error(`${category}: the point is ${read.kind}`)
  return read.entries
    .filter(entry => entry.scope.length > 0)
    .map(entry => ({ name: entry.key, scope: entry.scope, ...entry.item }))
    .sort((left, right) => (left.name < right.name ? -1 : 1))
}

/** What the tenant layer holds in one category, read over the wire: the list without the official assets it only
 * holds as every tenant does, whose holding is the official asset itself. */
async function ledger(assets: Assets, tenant: TenantId, category: string) {
  const listed = await assets['list-assets']({ tenant, category, after: null, limit: 100 })
  if (listed.outcome !== 'succeeded') throw new Error(`${category}: ${listed.outcome}`)
  return listed.body.items
    .filter(row => row.holding !== officialAssetRef(category, row.name))
    .map(row => ({ name: row.name, version: row.version, disabled: !row.enabled }))
    .sort((left, right) => (left.name < right.name ? -1 : 1))
}

function foreignTenant(tenant: string): string {
  const parsed = JSON.parse(tenant) as { organization: string; account: string }
  const last = parsed.account.at(-1) === 'a' ? 'b' : 'a'
  return JSON.stringify({ ...parsed, account: `${parsed.account.slice(0, -1)}${last}` })
}

describe('what the release brings is on the points of the categories', () => {
  it(
    'each official definition is one item of the whole deployment, named as the release names it',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        const registry = tree.scope.get('dynamis')?.registry()
        if (registry === undefined) throw new Error('the tree has no registry')
        const official = (category: string) => {
          const read = candidates<HeldItem>(registry, POINTS[category] as string, null, [])
          if (read.kind !== 'read') throw new Error(`${category}: the point is ${read.kind}`)
          expect(read.filtered, category).toEqual([])
          return read.entries.map(entry => [
            entry.key,
            entry.scope,
            entry.item.asset,
            entry.item.disabled,
          ])
        }
        const named = (category: string, names: readonly string[]) =>
          [...names].sort().map(name => [name, [], `official/${category}/${name}`, false])
        expect(official('converter').sort()).toEqual(
          named('converter', ['voice', 'application-pdf']),
        )
        expect(official('model-provider')).toEqual(named('model-provider', ['openrouter']))
        expect(official('AgentDefinition').sort()).toEqual(
          named('AgentDefinition', ['assistant', 'coding', 'examiner']),
        )
        expect(official('skill').sort()).toEqual(
          named('skill', ['skill-authoring', 'skin-authoring']),
        )
        const tools = official('tool')
        expect(tools).toHaveLength(21)
        expect(tools.map(([name]) => name)).toContain('Skills')
        for (const [name, scope, asset] of tools)
          expect([scope, asset]).toEqual([[], `official/tool/${String(name)}`])
      })
      expect(exitCode).toBe(0)
    },
  )
})

describe('what a tenant holds is on the points of the categories', () => {
  it(
    'after every change the entries at the scope of the tenant are the ledger, already when the change is answered',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        await settledSession(tree, 'hello')
        const assets = tree.clients.assets
        const tenantText = savedTenant(tree.home)
        const tenant = tenantOf(tenantText)
        const mine = scopeOfLayer('tenant', tenantText)
        const same = async () => {
          for (const category of Object.keys(POINTS)) {
            const onPoint = heldOn(tree, category, mine).map(({ name, version, disabled }) => ({
              name,
              version,
              disabled,
            }))
            expect(onPoint, category).toEqual(await ledger(assets, tenant, category))
          }
        }
        await same()

        const made = await upload(assets, tenant, 'up-1')
        expect(heldOn(tree, 'skill', mine)).toEqual([
          {
            name: 'review',
            scope: mine,
            asset: expect.any(String),
            version: made.version,
            disabled: false,
            immutable: false,
            replaceLocked: false,
          },
        ])
        await same()
        expect(heldOn(tree, 'skill', scopeOfLayer('tenant', foreignTenant(tenantText)))).toEqual([])
        expect(heldOn(tree, 'skill', scopeOfLayer('official'))).toEqual([])

        const holding = made.holding
        const disabled = await assets['set-asset-enabled']({
          tenant,
          operation: `off/${holding}`,
          holding,
          enabled: false,
        })
        expect(disabled.outcome).toBe('succeeded')
        expect(heldOn(tree, 'skill', mine).map(held => held.disabled)).toEqual([true])
        await same()

        const enabled = await assets['set-asset-enabled']({
          tenant,
          operation: `on/${holding}`,
          holding,
          enabled: true,
        })
        expect(enabled.outcome).toBe('succeeded')
        expect(heldOn(tree, 'skill', mine).map(held => held.disabled)).toEqual([false])

        const removed = await assets['remove-asset']({
          tenant,
          operation: `rm/${holding}`,
          holding,
        })
        expect(removed.outcome).toBe('succeeded')
        expect(heldOn(tree, 'skill', mine)).toEqual([])
        await same()
      })
      expect(exitCode).toBe(0)
    },
  )

  it(
    'after a restart the entries are back as soon as the assets of the tenant are opened',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      let version = ''
      const exitCodes = await onReleaseTreeRuns({ script: toolCallsThenText(() => []) }, [
        async tree => {
          await settledSession(tree, 'hello')
          const tenant = tenantOf(savedTenant(tree.home))
          version = (await upload(tree.clients.assets, tenant, 'up-1')).version
        },
        async tree => {
          const tenantText = savedTenant(tree.home)
          const mine = scopeOfLayer('tenant', tenantText)
          expect(heldOn(tree, 'skill', mine)).toEqual([])
          const listed = await ledger(tree.clients.assets, tenantOf(tenantText), 'skill')
          expect(listed).toEqual([{ name: 'review', version, disabled: false }])
          expect(heldOn(tree, 'skill', mine).map(held => [held.name, held.version])).toEqual([
            ['review', version],
          ])
        },
      ])
      expect(exitCodes).toEqual([0, 0])
    },
  )
})
