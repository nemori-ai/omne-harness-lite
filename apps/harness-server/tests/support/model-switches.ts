import { expect } from 'vitest'
import type { JsonValue } from '@omne-harness/assets'
import { savedTenant } from '../r9/support.ts'
import { tenantOf } from './protocol-clients.ts'
import type { ReleaseTree } from './release-tree.ts'

const OPENROUTER = { kind: 'asset', category: 'model-provider', name: 'openrouter' } as const

const switches = (entries: Readonly<Record<string, boolean>>): JsonValue => ({
  kind: 'object',
  entries: Object.entries(entries).map(([key, on]) => ({
    key,
    value: { kind: 'boolean', value: on },
  })),
})

/** Sets the tenant's on and off for some models of OpenRouter, the way the assets page writes it. */
export async function setModelSwitches(
  tree: ReleaseTree,
  entries: Readonly<Record<string, boolean>>,
): Promise<void> {
  const tenant = tenantOf(savedTenant(tree.home))
  const assets = tree.clients.assets
  const current = await assets['describe-setting']({
    tenant,
    owner: OPENROUTER,
    item: 'model-switches',
  })
  if (current.outcome !== 'succeeded') throw new Error(`describe: ${current.outcome}`)
  const written = await assets['set-setting']({
    tenant,
    owner: OPENROUTER,
    item: 'model-switches',
    operation: `switches-${Object.keys(entries).join('-')}`,
    expectedRevision: current.body.item.revision,
    value: { kind: 'ordinary', value: switches(entries) as never },
  })
  expect(written).toMatchObject({ outcome: 'succeeded' })
}
