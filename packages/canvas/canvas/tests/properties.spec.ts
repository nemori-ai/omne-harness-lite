import { describe, expect, it } from 'vitest'
import type { CanvasStore } from '@omne-harness/canvas'
import {
  createMemoryStore,
  PROPERTY_CONFIG,
  runCanvasProperties,
} from '@omne-harness/canvas/testing'
import type { Item } from '@omne-harness/canvas-contract'

describe('random sequences of every write keep the properties of the arrangement', () => {
  it.each(Array.from({ length: 40 }, (_, seed) => seed + 1))(
    'over the memory store, seed %i',
    async seed => {
      await expect(
        runCanvasProperties(async () => createMemoryStore(), seed, 80),
      ).resolves.toBeUndefined()
    },
  )
})

type Bend = Readonly<{
  on?: (items: readonly Item[], looks: number) => readonly Item[]
  off?: (items: readonly Item[]) => readonly Item[]
  revision?: (looks: number) => number
}>

/** The memory store, with what it reads bent the way a broken store would read. */
const bent = (bend: Bend) => async (): Promise<CanvasStore> => {
  const store = createMemoryStore()
  let looks = 0
  return {
    ...store,
    async look(tenant, canvas) {
      const read = await store.look(tenant, canvas)
      if (read.kind !== 'read') return read
      looks += 1
      const { items, revision } = read.value
      return {
        kind: 'read',
        value: {
          ...read.value,
          items: bend.on?.(items, looks) ?? items,
          revision: bend.revision?.(looks) ?? revision,
        },
      }
    },
    async away(tenant, canvas, page) {
      const read = await store.away(tenant, canvas, page)
      if (read.kind !== 'read') return read
      return {
        kind: 'read',
        value: { ...read.value, items: bend.off?.(read.value.items) ?? read.value.items },
      }
    },
  }
}

const copies = (items: readonly Item[], count: number) =>
  items.length === 0
    ? items
    : Array.from({ length: count }, (_, n) => ({
        ...items[0]!,
        id: `copy-${n}` as Item['id'],
        reference: { kind: 'media.object', ref: `copy-${n}` },
        rank: 1000 + n,
      }))

describe('the property run tells a store that breaks the arrangement', () => {
  it.each<[string, Bend]>([
    ['a reference has two records', { on: items => [...items, ...items.slice(0, 1)] }],
    [
      'two items on the sheet share a rank',
      { on: items => items.map(item => ({ ...item, rank: 1 })) },
    ],
    [
      'a taken item is in a pile or locked',
      { off: items => items.map(item => ({ ...item, locked: true })) },
    ],
    [
      'a locked item is in a pile',
      { on: items => items.map(item => (item.pile === null ? item : { ...item, locked: true })) },
    ],
    [
      'an item is off the sheet',
      {
        on: items => items.map(item => ({ ...item, at: { x: PROPERTY_CONFIG.sheet.width, y: 0 } })),
      },
    ],
    [
      'more items are on than the limit',
      { on: items => copies(items, PROPERTY_CONFIG.limits.placed + 1) },
    ],
    ['the revision went back', { revision: looks => 1000 - looks }],
    [
      'the locked item i\\d+ left the sheet',
      { on: (items, looks) => (looks % 2 === 0 ? items : items.filter(item => !item.locked)) },
    ],
    [
      'the locked item i\\d+ changed',
      {
        on: (items, looks) =>
          items.map(item =>
            item.locked && looks % 2 === 1 ? { ...item, size: { width: 121, height: 65 } } : item,
          ),
      },
    ],
  ])('%s', async (problem, bend) => {
    await expect(runCanvasProperties(bent(bend), 1, 200)).rejects.toThrow(
      new RegExp(`^seed 1, step \\d+, .*: ${problem}$`),
    )
  })
})
