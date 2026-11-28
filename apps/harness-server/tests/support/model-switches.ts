import { expect } from 'vitest'
import type { JsonValue } from '@omne-harness/assets'
import { savedTenant } from '../r9/support.ts'
import { tenantOf } from './protocol-clients.ts'
import type { ReleaseTree } from './release-tree.ts'

const providerAsset = (name: string) =>
  ({ kind: 'asset', category: 'model-provider', name }) as const

const objectOf = (entries: Readonly<Record<string, JsonValue>>): JsonValue => ({
  kind: 'object',
  entries: Object.entries(entries).map(([key, value]) => ({ key, value })),
})

// Writes one of the two model settings of a provider for the tenant, the way the assets page writes it.
async function setModelSetting(
  tree: ReleaseTree,
  item: 'model-switches' | 'model-reasoning-efforts',
  entries: Readonly<Record<string, JsonValue>>,
  provider = 'openrouter',
): Promise<void> {
  const tenant = tenantOf(savedTenant(tree.home))
  const assets = tree.clients.assets
  const owner = providerAsset(provider)
  const current = await assets['describe-setting']({ tenant, owner, item })
  if (current.outcome !== 'succeeded') throw new Error(`describe: ${current.outcome}`)
  const written = await assets['set-setting']({
    tenant,
    owner,
    item,
    operation: `${item}-${current.body.item.revision}-${Object.keys(entries).join('-')}`,
    expectedRevision: current.body.item.revision,
    value: { kind: 'ordinary', value: objectOf(entries) as never },
  })
  expect(written).toMatchObject({ outcome: 'succeeded' })
}

/** Sets the tenant's on and off for some models of one kind of a provider: chat models of OpenRouter unless named. */
export const setModelSwitches = (
  tree: ReleaseTree,
  on: Readonly<Record<string, boolean>>,
  kind: 'llm' | 'decisions' = 'llm',
  provider = 'openrouter',
) =>
  setModelSetting(
    tree,
    'model-switches',
    {
      [kind]: objectOf(
        Object.fromEntries(
          Object.entries(on).map(([model, value]) => [model, { kind: 'boolean', value }]),
        ),
      ),
    },
    provider,
  )

/** Sets the tenant's default reasoning effort for some models of OpenRouter. */
export const setModelEfforts = (tree: ReleaseTree, efforts: Readonly<Record<string, string>>) =>
  setModelSetting(
    tree,
    'model-reasoning-efforts',
    Object.fromEntries(
      Object.entries(efforts).map(([model, value]) => [model, { kind: 'string', value }]),
    ),
  )
