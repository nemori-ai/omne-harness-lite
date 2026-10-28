import { describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { testingTenant } from '@omne-harness/tool-contract/testing'
import type {
  ToolResidencyReader,
  ToolResidencyReference,
} from '@omne-harness/tool-cordis-contract/cordis'
import {
  createMemoryToolBindingRegistry,
  memoryToolBindingRegistryFixture,
  toolResidencyReaderConformance,
} from '@omne-harness/tool-cordis-contract/testing'

const otherTenant = testingTenant(
  'org_c0nf0rmance000000000000000',
  'acc_c0nf0rmance0ther0000000000',
)

function fixture() {
  const registry = memoryToolBindingRegistryFixture()
  const loaded = registry.loaded(registry.authority, 'first-shape')
  const references: readonly ToolResidencyReference[] = [
    { holder: 'opaque-holder', tenant: registry.access.tenant, shape: loaded.shape },
    {
      holder: 'opaque-holder',
      tenant: otherTenant,
      shape: { ...loaded.shape, name: 'different-first-shape' },
    },
  ]
  let unavailable = false
  const reader: ToolResidencyReader = {
    async referencing({ after }) {
      if (unavailable) return fail({ kind: 'unavailable', diagnostic: 'holder source unavailable' })
      return succeed(
        after === null
          ? { items: references.slice(0, 1), next: 'opaque-next-page' }
          : { items: references.slice(1), next: null },
      )
    },
  }
  return {
    reader,
    key: loaded.key,
    references,
    interrupt: () => {
      unavailable = true
    },
  }
}

describe('residency reader shared contract', () => {
  const names = [
    'all pages preserve every holder tenant and first shape',
    'a page failure stays unavailable and cannot become an empty terminal page',
  ]
  for (const name of names)
    it(name, async () => {
      const cases = toolResidencyReaderConformance()
      expect(cases.map(test => test.name)).toEqual(names)
      expect(cases.map(test => test.clause)).toEqual(['G7', 'G7'])
      const scenario = cases.find(test => test.name === name)
      if (!scenario) throw new Error('missing reader case')
      await scenario.run(fixture())
    })

  it('does not impose a traversal order on the holder source', async () => {
    const source = fixture()
    source.reader = {
      referencing: async () => succeed({ items: [...source.references].reverse(), next: null }),
    }
    await toolResidencyReaderConformance()[0]?.run(source)
  })

  it('detects a reader that merges holders across tenants', async () => {
    const source = fixture()
    source.reader = {
      referencing: async () => succeed({ items: source.references.slice(0, 1), next: null }),
    }
    await expect(toolResidencyReaderConformance()[0]?.run(source)).rejects.toThrow()
  })

  it('detects a reader that turns an interrupted page into an empty page', async () => {
    const source = fixture()
    source.interrupt = () => {
      source.reader.referencing = async () => succeed({ items: [], next: null })
    }
    await expect(toolResidencyReaderConformance()[1]?.run(source)).rejects.toThrow()
  })
})

it('the public registry test boundary refuses missing, unminted and foreign tenants', () => {
  const source = memoryToolBindingRegistryFixture()
  const authority = {
    ...source.authority,
    layer: { kind: 'tenant' as const, tenant: source.access.tenant },
  }
  const registry = createMemoryToolBindingRegistry<string>([
    { authority, registrants: [source.access.tenant] },
  ])
  const input = { ...source.access, authority, loaded: source.loaded(authority, 'tenant-only') }
  expect(registry.register(input)).toHaveProperty('ok')
  expect(registry.snapshot({ ...source.access, tenant: otherTenant })).toEqual({ ok: [] })
  expect(registry.register({ ...input, tenant: otherTenant })).toEqual({
    failure: { kind: 'denied' },
  })
  const missing = { ...source.access }
  Reflect.deleteProperty(missing, 'tenant')
  expect(registry.snapshot(missing)).toMatchObject({ failure: { kind: 'unavailable' } })
  expect(
    registry.snapshot({ ...source.access, tenant: structuredClone(source.access.tenant) }),
  ).toMatchObject({ failure: { kind: 'unavailable' } })
})

it.each(['shape', 'duplicate', 'cursor'] as const)(
  'detects reader corruption: %s',
  async breach => {
    const source = fixture()
    const first = source.references[0]
    if (!first) throw new Error('missing reference')
    source.reader.referencing = async () =>
      succeed({
        items:
          breach === 'duplicate'
            ? [...source.references, first]
            : source.references.map(item =>
                breach === 'shape' ? { ...item, shape: first.shape } : item,
              ),
        next: breach === 'cursor' ? 'same-cursor' : null,
      })
    const scenario = toolResidencyReaderConformance()[0]
    if (!scenario) throw new Error('missing reader case')
    await expect(scenario.run(source)).rejects.toThrow()
  },
)
