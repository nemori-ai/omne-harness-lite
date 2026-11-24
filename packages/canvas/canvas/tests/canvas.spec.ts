import { describe, expect, it } from 'vitest'
import {
  context,
  createMemoryStore,
  tenantOf,
  type MemoryStore,
} from '@omne-harness/canvas/testing'
import type { Item, Pile } from '@omne-harness/canvas-contract'
import { CONFIG, kind, world as base } from './fixture.ts'

const SHEET = CONFIG.sheet
const AT = '2026-11-24T06:00:00.000Z'

function world(store: MemoryStore = createMemoryStore()) {
  const { authority, kinds, movers, canvas } = base({ store })
  return { authority, kinds, movers, canvas }
}

const item = (id: string, rank: number, state: 'on' | 'off' = 'on'): Item =>
  ({
    id,
    reference: { kind: 'media.object', ref: `obj-${id}` },
    state,
    at: { x: 8, y: 16 },
    size: null,
    rank,
    pile: null,
    locked: false,
    by: { kind: 'human' },
    when: AT,
  }) as Item
const pile = (id: string): Pile =>
  ({ id, name: null, at: { x: 0, y: 0 }, by: { kind: 'human' }, when: AT }) as Pile

describe('look', () => {
  it('reads an empty canvas with the configured sheet for a tenant that has no record', async () => {
    const { canvas, authority } = world()
    expect(await canvas.look(context(), { canvas: 'main' })).toEqual({
      kind: 'done',
      value: { sheet: SHEET, items: [], piles: [], revision: 0 },
    })
    expect(authority.asked()).toEqual([{ tenant: 'tenant-1', action: 'read' }])
  })

  it('does not ask who the caller is: a read changes nothing to record', async () => {
    const { canvas, movers } = world()
    movers.set(null)
    expect(await canvas.look(context(), { canvas: 'main' })).toMatchObject({ kind: 'done' })
    expect(await canvas.kinds(context())).toMatchObject({ kind: 'done' })
    expect(movers.asked()).toBe(0)
  })

  it('gives the items on the sheet from the bottom up and every pile, and none that were taken', async () => {
    const store = createMemoryStore()
    store.seed(tenantOf('tenant-1'), 'main', {
      revision: 7,
      items: [item('b', 2), item('a', 5), item('c', 1, 'off'), item('d', 2)],
      piles: [pile('q'), pile('p')],
    })
    const read = await world(store).canvas.look(context(), { canvas: 'main' })
    if (read.kind !== 'done') throw new Error(read.kind)
    expect(read.value.revision).toBe(7)
    expect(read.value.items.map(({ id }) => id)).toEqual(['b', 'd', 'a'])
    expect(read.value.piles.map(({ id }) => id)).toEqual(['p', 'q'])
  })

  it('reads the canvas of the tenant that acts, and no other', async () => {
    const store = createMemoryStore()
    store.seed(tenantOf('tenant-2'), 'main', { revision: 3, items: [item('a', 1)], piles: [] })
    const { canvas } = world(store)
    expect(await canvas.look(context('tenant-1'), { canvas: 'main' })).toMatchObject({
      value: { items: [], revision: 0 },
    })
    expect(await canvas.look(context('tenant-2'), { canvas: 'main' })).toMatchObject({
      value: { revision: 3 },
    })
  })

  it('answers an unavailable basis when the store cannot read, never an empty canvas', async () => {
    const store = createMemoryStore()
    store.failReads(true)
    expect(await world(store).canvas.look(context(), { canvas: 'main' })).toEqual({
      kind: 'basis-unavailable',
    })
  })

  it('answers an unavailable basis when the store throws', async () => {
    const gone = () => {
      throw new Error('the storage is gone')
    }
    const throwing = { ...createMemoryStore(), look: gone }
    const rejecting = {
      ...createMemoryStore(),
      look: async () => Promise.reject(new Error('gone')),
    }
    for (const store of [throwing, rejecting])
      expect(await world(store).canvas.look(context(), { canvas: 'main' })).toEqual({
        kind: 'basis-unavailable',
      })
  })

  it('answers denied when the authority refuses, before the store is read', async () => {
    const store = createMemoryStore()
    store.failReads(true)
    const { canvas, authority } = world(store)
    authority.answer('denied')
    expect(await canvas.look(context(), { canvas: 'main' })).toEqual({ kind: 'denied' })
  })

  it.each(['unavailable', 'throw'] as const)(
    'answers an unavailable basis when the authority answers %s',
    async answer => {
      const { canvas, authority } = world()
      authority.answer(answer)
      expect(await canvas.look(context(), { canvas: 'main' })).toEqual({
        kind: 'basis-unavailable',
      })
    },
  )

  it('names the canvas that does not fit before it asks the authority', async () => {
    const { canvas, authority } = world()
    authority.answer('denied')
    expect(await canvas.look(context(), { canvas: 'other' })).toEqual({
      kind: 'invalid',
      where: 'canvas',
    })
    expect(authority.asked()).toEqual([])
  })
})

describe('kinds', () => {
  it('lists the kinds the registry has now, the conflicts with them', async () => {
    const { canvas, kinds } = world()
    expect(await canvas.kinds(context())).toEqual({ kind: 'done', value: [] })
    kinds.declare(kind('canvas.app'))
    kinds.declare(kind('media.object'), 'a')
    kinds.declare(kind('media.object'), 'b')
    expect(await canvas.kinds(context())).toEqual({
      kind: 'done',
      value: [
        {
          kind: 'declared',
          name: 'canvas.app',
          label: 'canvas.app',
          summary: 'canvas.app is a thing',
          reference: 'the identity of a canvas.app',
        },
        { kind: 'conflict', name: 'media.object', by: ['a', 'b'] },
      ],
    })
  })

  it.each(['unavailable', 'throw'] as const)(
    'answers an unavailable basis when the registry is %s, never an empty list',
    async state => {
      const { canvas, kinds } = world()
      kinds.fail(state)
      expect(await canvas.kinds(context())).toEqual({ kind: 'basis-unavailable' })
    },
  )

  it('asks the authority whether the canvas may be read, and stops at a refusal', async () => {
    const { canvas, kinds, authority } = world()
    kinds.declare(kind('canvas.app'))
    authority.answer('denied')
    expect(await canvas.kinds(context())).toEqual({ kind: 'denied' })
    authority.answer('unavailable')
    expect(await canvas.kinds(context())).toEqual({ kind: 'basis-unavailable' })
    expect(authority.asked().map(({ action }) => action)).toEqual(['read', 'read'])
  })
})
