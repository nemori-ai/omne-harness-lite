import { describe, expect, it } from 'vitest'
import { ShellAssemblyError, createSlotStore } from '@omne-harness/shell-contract'

const render = (): null => null
const gate = (id: string) => ({ id, render })
const page = (id: string, order = 0) => ({ id, title: id, order, render })
const side = (id: string, order = 0) => ({ id, order, render })
const ids = (items: readonly { id: string }[]) => items.map(item => item.id)

describe('createSlotStore', () => {
  it('starts empty in every slot', () => {
    const store = createSlotStore()
    expect([store.items('gate'), store.items('pages'), store.items('sidebar')]).toEqual([
      [],
      [],
      [],
    ])
  })

  it('holds one in the gate and refuses a second, whatever its id', () => {
    const store = createSlotStore()
    store.place('gate', gate('login'))
    expect(() => store.place('gate', gate('other'))).toThrow(
      expect.objectContaining({ slot: 'gate', id: 'other', reason: 'occupied' }),
    )
    expect(() => store.place('gate', gate('login'))).toThrow(ShellAssemblyError)
    expect(ids(store.items('gate'))).toEqual(['login'])
  })

  it('refuses a repeated id inside a list slot and allows it across slots', () => {
    const store = createSlotStore()
    store.place('pages', page('x'))
    expect(() => store.place('pages', page('x', 5))).toThrow(
      expect.objectContaining({ slot: 'pages', id: 'x', reason: 'duplicate' }),
    )
    store.place('sidebar', side('x'))
    expect(ids(store.items('pages'))).toEqual(['x'])
    expect(ids(store.items('sidebar'))).toEqual(['x'])
  })

  it('orders a list by order, and an equal order by id whatever the placing order was', () => {
    const store = createSlotStore()
    for (const [id, order] of [
      ['c', 2],
      ['z', 1],
      ['a', 1],
      ['first', 0],
      ['b', 1],
    ] as const)
      store.place('sidebar', side(id, order))
    expect(ids(store.items('sidebar'))).toEqual(['first', 'a', 'b', 'z', 'c'])
  })

  it('compares ids by code unit', () => {
    const store = createSlotStore()
    for (const id of ['b', 'B', 'a']) store.place('pages', page(id))
    expect(ids(store.items('pages'))).toEqual(['B', 'a', 'b'])
  })

  it('takes down only the item that was placed by that call', () => {
    const store = createSlotStore()
    const takeA = store.place('pages', page('a'))
    store.place('pages', page('b'))
    takeA()
    expect(ids(store.items('pages'))).toEqual(['b'])
  })

  it('frees a gate that was taken down', () => {
    const store = createSlotStore()
    store.place('gate', gate('g'))()
    expect(store.items('gate')).toEqual([])
    store.place('gate', gate('h'))
    expect(ids(store.items('gate'))).toEqual(['h'])
  })

  it('tells the subscribers of that slot on a placing and on a taking down, and only them', () => {
    const store = createSlotStore()
    const seen: string[] = []
    store.subscribe('pages', () => seen.push('pages'))
    store.subscribe('sidebar', () => seen.push('sidebar'))
    const take = store.place('pages', page('a'))
    expect(seen).toEqual(['pages'])
    take()
    expect(seen).toEqual(['pages', 'pages'])
  })

  it('does not tell anyone when a placing is refused', () => {
    const store = createSlotStore()
    store.place('pages', page('a'))
    let told = 0
    store.subscribe('pages', () => (told += 1))
    expect(() => store.place('pages', page('a'))).toThrow()
    expect(told).toBe(0)
  })

  it('stops telling a subscriber that unsubscribed', () => {
    const store = createSlotStore()
    let told = 0
    const off = store.subscribe('pages', () => (told += 1))
    off()
    store.place('pages', page('a'))
    expect(told).toBe(0)
  })

  it('takes down once when asked twice, and leaves a later holder of the id alone', () => {
    const store = createSlotStore()
    let told = 0
    const take = store.place('pages', page('a'))
    take()
    store.subscribe('pages', () => (told += 1))
    take()
    expect(told).toBe(0)
    store.place('pages', page('b'))
    store.place('pages', page('a', 1))
    told = 0
    take()
    expect(told).toBe(0)
    expect(ids(store.items('pages'))).toEqual(['b', 'a'])
  })
})
