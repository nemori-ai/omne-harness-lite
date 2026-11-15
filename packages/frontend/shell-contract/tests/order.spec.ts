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
