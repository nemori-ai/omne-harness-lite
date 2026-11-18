import { expect, it } from 'vitest'
import { createCategoryPoint } from '@omne-harness/assets'
import type { AssetsLocal } from '@omne-harness/assets-local'
import {
  loopExtensionBodyContract,
  loopExtensionCategoryDisplay,
} from '@omne-harness/loop-extension-contract'
import { createSettingsRegistry, type SettingDefinitions } from '@omne-harness/settings'
import { heldDefinitionsOf } from '../../../src/rows/governance/held-definitions.ts'

const definitionOf = (name: string, version: string): SettingDefinitions => ({
  providerId: 'loop-extension',
  definitionId: name,
  version,
  groups: [{ id: 'run', parentId: null, title: 'Run', description: 'Run', order: 0 }],
  items: [
    {
      id: 'run',
      groupId: 'run',
      category: 'preference',
      presentation: {
        title: 'Run',
        description: 'Run',
        impact: 'Run',
        clear: 'Off',
        adoption: 'next-read',
      },
      valueSchema: { type: 'boolean' },
      default: { kind: 'value', value: false },
      merge: 'override',
      sensitivity: 'ordinary',
    },
  ],
})

/** The local assets of one tenant, with only what the step reads: the held extensions and a change signal. */
function assetsOf(held: Map<string, string>, failing = { list: false }) {
  const listeners = new Set<() => void>()
  const reads = { list: 0, held: 0 }
  const assets = {
    async listHeld(request: { category: string }) {
      reads.list += 1
      if (failing.list) return { kind: 'rejected', reason: 'unavailable' }
      const items =
        request.category === 'loop-extension'
          ? [...held.keys()].map(name => ({ category: request.category, name }))
          : []
      return { kind: 'page', items, next: null }
    },
    async readHeldCapability({ capability }: { capability: { name: string } }) {
      reads.held += 1
      const version = held.get(capability.name)
      return version === undefined
        ? { kind: 'absent' }
        : {
            kind: 'holding',
            holding: {},
            selected: { definition: definitionOf(capability.name, version) },
          }
    },
    changes: {
      subscribe(listener: () => void) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
  } as unknown as AssetsLocal
  return { assets, reads, change: () => listeners.forEach(listener => listener()) }
}

function categories() {
  const point = createCategoryPoint()
  point.contribute({ contract: loopExtensionBodyContract(), display: loopExtensionCategoryDisplay })
  return point
}

const known = (registry: ReturnType<typeof createSettingsRegistry>) =>
  registry
    .snapshot()
    .definitions.map(definition => `${definition.definitionId}@${definition.version}`)
    .sort()

it('registers the settings definition of every held version once, and reads nothing more until the assets change', async () => {
  const registry = createSettingsRegistry({ capacity: 8 })
  const held = new Map([
    ['guard', 'v1'],
    ['watch', 'v1'],
  ])
  const tenant = assetsOf(held)
  const step = heldDefinitionsOf({ registry, categories: categories() })
  await Promise.all([step.ensure(tenant.assets), step.ensure(tenant.assets)])
  expect(known(registry)).toEqual(['guard@v1', 'watch@v1'])
  expect(tenant.reads).toEqual({ list: 1, held: 2 })
  await step.ensure(tenant.assets)
  expect(tenant.reads).toEqual({ list: 1, held: 2 })
  held.set('guard', 'v2')
  tenant.change()
  await step.ensure(tenant.assets)
  expect(known(registry)).toEqual(['guard@v1', 'guard@v2', 'watch@v1'])
  expect(tenant.reads).toEqual({ list: 2, held: 4 })
})

it('does not register a definition twice for two tenants, so the registry keeps its places', async () => {
  const registry = createSettingsRegistry({ capacity: 2 })
  for (const held of [
    new Map([['guard', 'v1']]),
    new Map([['guard', 'v1']]),
    new Map([['watch', 'v1']]),
  ])
    await heldDefinitionsOf({ registry, categories: categories() }).ensure(assetsOf(held).assets)
  expect(known(registry)).toEqual(['guard@v1', 'watch@v1'])
})

it('scans again on the next read when the holdings could not be read', async () => {
  const registry = createSettingsRegistry({ capacity: 8 })
  const failing = { list: true }
  const tenant = assetsOf(new Map([['guard', 'v1']]), failing)
  const step = heldDefinitionsOf({ registry, categories: categories() })
  await step.ensure(tenant.assets)
  expect(known(registry)).toEqual([])
  failing.list = false
  await step.ensure(tenant.assets)
  expect(known(registry)).toEqual(['guard@v1'])
})

it('reads only the categories whose contract declares settings, and nothing without the assets of the tenant', async () => {
  const registry = createSettingsRegistry({ capacity: 8 })
  const step = heldDefinitionsOf({ registry, categories: createCategoryPoint() })
  const tenant = assetsOf(new Map([['guard', 'v1']]))
  await step.ensure(tenant.assets)
  await step.ensure(undefined)
  expect(tenant.reads).toEqual({ list: 0, held: 0 })
  expect(known(registry)).toEqual([])
})
