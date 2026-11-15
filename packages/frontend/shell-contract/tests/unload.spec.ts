import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { render, startShell } from './reference-shell.ts'

const page = (id: string, order = 0) => ({ id, title: id, order, render })

describe('unloading the caller', () => {
  it('takes down what the caller placed and leaves what others placed', async () => {
    const { root, shell } = await startShell()
    const first = root.plugin({
      name: 'first',
      inject: ['shell'],
      apply(ctx: Context) {
        ctx.shell.contribute('pages', page('a'))
        ctx.shell.contribute('sidebar', { id: 'a', order: 0, render })
      },
    })
    await first
    await root.plugin({
      name: 'second',
      inject: ['shell'],
      apply(ctx: Context) {
        ctx.shell.contribute('pages', page('b'))
      },
    })
    expect(shell.items('pages').map(item => item.id)).toEqual(['a', 'b'])
    let notified = 0
    shell.subscribe('pages', () => (notified += 1))
    await first.dispose()
    expect(shell.items('pages').map(item => item.id)).toEqual(['b'])
    expect(shell.items('sidebar')).toEqual([])
    expect(notified).toBe(1)
  })

  it('frees the slot that holds one, so another caller can place there', async () => {
    const { root, shell } = await startShell()
    const first = root.plugin({
      name: 'first',
      inject: ['shell'],
      apply: (ctx: Context) => ctx.shell.contribute('gate', { id: 'g', render }),
    })
    await first
    await first.dispose()
    expect(shell.items('gate')).toEqual([])
    await root.plugin({
      name: 'second',
      inject: ['shell'],
      apply: (ctx: Context) => ctx.shell.contribute('gate', { id: 'h', render }),
    })
    expect(shell.items('gate').map(item => item.id)).toEqual(['h'])
  })
})
