import { describe, expect, it } from 'vitest'
import { render, startShell } from './reference-shell.ts'

describe('a list slot', () => {
  it('orders by order, then by id, whatever the placing order was', async () => {
    const { root, shell } = await startShell()
    const entries: [string, number][] = [
      ['c', 2],
      ['b', 1],
      ['z', 1],
      ['a', 1],
      ['first', 0],
    ]
    for (const [id, order] of entries)
      await root.plugin({
        name: `p-${id}`,
        inject: ['shell'],
        apply: ctx => ctx.shell.contribute('sidebar', { id, order, render }),
      })
    expect(shell.items('sidebar').map(item => item.id)).toEqual(['first', 'a', 'b', 'z', 'c'])
  })

  it('orders what floats over the application the same way', async () => {
    const { root, shell } = await startShell()
    const entries: [string, number][] = [
      ['b', 1],
      ['a', 1],
      ['first', 0],
    ]
    for (const [id, order] of entries)
      await root.plugin({
        name: `p-${id}`,
        inject: ['shell'],
        apply: ctx => ctx.shell.contribute('float', { id, order, render }),
      })
    expect(shell.items('float').map(item => item.id)).toEqual(['first', 'a', 'b'])
    expect(shell.items('sidebar')).toEqual([])
  })

  it('orders the attached slot by order, then by id, not by anchor', async () => {
    const { root, shell } = await startShell()
    const entries: [string, number, string][] = [
      ['c', 2, 'test.x'],
      ['b', 1, 'test.a'],
      ['a', 1, 'test.b'],
      ['first', 0, 'test.b'],
    ]
    for (const [id, order, anchor] of entries)
      await root.plugin({
        name: `p-${id}`,
        inject: ['shell'],
        apply: ctx => ctx.shell.contribute('attached', { id, order, anchor, render }),
      })
    expect(shell.items('attached').map(item => item.id)).toEqual(['first', 'a', 'b', 'c'])
  })

  it('compares ids by code unit, not by locale', async () => {
    const { root, shell } = await startShell()
    for (const id of ['b', 'B', 'a'])
      await root.plugin({
        name: `p-${id}`,
        inject: ['shell'],
        apply: ctx => ctx.shell.contribute('sidebar', { id, order: 0, render }),
      })
    expect(shell.items('sidebar').map(item => item.id)).toEqual(['B', 'a', 'b'])
  })
})

describe('the whole attached slot, across the places', () => {
  const item = (anchor: string, id: string, order = 0) => ({ anchor, id, order, render })
  const listed = async (...items: ReturnType<typeof item>[]) => {
    const { root, shell } = await startShell()
    await root.plugin({
      name: 'a',
      inject: ['shell'],
      apply: ctx => items.forEach(made => ctx.shell.contribute('attached', made)),
    })
    return shell.items('attached').map(made => `${made.anchor}:${made.id}`)
  }

  it('orders by the id before the place: an id that comes first is first, wherever it is attached', async () => {
    expect(await listed(item('test.b', 'a'), item('test.a', 'b'))).toEqual(['test.b:a', 'test.a:b'])
    expect(await listed(item('test.a', 'b'), item('test.b', 'a'))).toEqual(['test.b:a', 'test.a:b'])
  })

  it('orders items of one order and one id by the place', async () => {
    expect(await listed(item('test.b', 'x'), item('test.a', 'x'))).toEqual(['test.a:x', 'test.b:x'])
    expect(await listed(item('test.a', 'x'), item('test.b', 'x'))).toEqual(['test.a:x', 'test.b:x'])
  })

  it('orders by the order before both', async () => {
    expect(await listed(item('test.a', 'a', 2), item('test.b', 'z', 1))).toEqual([
      'test.b:z',
      'test.a:a',
    ])
  })
})
