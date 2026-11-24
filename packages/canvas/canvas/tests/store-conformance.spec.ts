import { describe, expect, it } from 'vitest'
import { createMemoryStore, storeConformanceCases, tenantOf } from '@omne-harness/canvas/testing'

describe('the memory store conforms to the store contract', () => {
  it.each(storeConformanceCases)('$name', async conformance => {
    await expect(conformance.run(async () => createMemoryStore())).resolves.toBeUndefined()
  })
})

it('the memory store refuses a second item of a reference written past the domain', async () => {
  const store = createMemoryStore()
  const placed = await store.place(tenantOf('t1'), {
    canvas: 'main',
    by: { kind: 'human' },
    when: '2026-11-24T06:00:00.000Z' as never,
    rules: {
      sheet: { width: 800, height: 800, grid: 8 },
      footprint: { width: 160, height: 80 },
      placed: 5,
      away: 5,
    },
    reference: { kind: 'media.object', ref: 'a' },
    declared: true,
  })
  if (placed.kind !== 'committed' || placed.value.kind !== 'changed') throw new Error('not placed')
  const facts = store.facts(tenantOf('t1'))
  expect(() => facts.putItem('main', { ...placed.value.item, id: 'i9' as never })).toThrow(
    /UNIQUE/u,
  )
})
