import { Context, type Fiber } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { ShellAssemblyError, shellContracts, type SayItem } from '@omne-harness/shell-contract'
import { render, startShell } from './reference-shell.ts'

const sayItem = (id: string): SayItem => ({
  id,
  targets: () => undefined,
  current: () => undefined,
  subscribe: () => () => undefined,
  say: async () => ({ kind: 'unknown' }),
  show: () => undefined,
})

function place(root: Context, name: string, put: (ctx: Context) => void): Fiber {
  return root.plugin({ name, inject: ['shell'], apply: put })
}

function failure(root: Context, put: (ctx: Context) => void): Promise<unknown> {
  return new Promise(resolve => {
    root.plugin({
      name: 'late',
      inject: ['shell'],
      apply(ctx: Context) {
        try {
          put(ctx)
        } catch (error) {
          resolve(error)
          throw error
        }
      },
    })
  })
}

const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 5))

describe('the place words said to the figure go, which holds one', () => {
  it('places into an empty slot, and the shell reads back the very item it was given', async () => {
    const { root, shell } = await startShell()
    const item = sayItem('session')
    await place(root, 'a', ctx => ctx.shell.contribute('say', item))
    expect(shell.items('say')).toEqual([item])
    expect(shell.items('say')[0]).toBe(item)
    expect(shell.conflicts('say')).toEqual([])
    expect(shell.owner('say', 'session')).toBe('a')
  })

  it('answers a conflict when another module puts one: neither is in place, both are named, and the one left takes effect', async () => {
    const { root, shell } = await startShell()
    const first = await place(root, 'a', ctx => ctx.shell.contribute('say', sayItem('session')))
    await place(root, 'b', ctx => ctx.shell.contribute('say', sayItem('other')))
    expect(shell.items('say')).toEqual([])
    expect(shell.conflicts('say')).toEqual([
      { slot: 'say', anchor: undefined, id: '', by: ['a', 'b'] },
    ])
    await first.dispose()
    await settle()
    expect(shell.items('say').map(item => item.id)).toEqual(['other'])
    expect(shell.conflicts('say')).toEqual([])
  })

  it('throws when one module puts a second one, and nothing of that module is in place', async () => {
    const { root, shell } = await startShell()
    const error = await failure(root, ctx => {
      ctx.shell.contribute('say', sayItem('session'))
      ctx.shell.contribute('say', sayItem('session'))
    })
    expect(error).toBeInstanceOf(ShellAssemblyError)
    expect(error).toMatchObject({ slot: 'say', id: 'session', reason: 'duplicate' })
    await settle()
    expect(shell.items('say')).toEqual([])
  })

  it('leaves an item that lacks one of its functions out of place', async () => {
    const { root, shell } = await startShell()
    const { show: _show, ...lacking } = sayItem('session')
    await place(root, 'a', ctx => ctx.shell.contribute('say', lacking as SayItem))
    expect(shell.items('say')).toEqual([])
  })

  it('stands apart from the back: an item on one is not on the other', async () => {
    const { root, shell } = await startShell()
    await place(root, 'a', ctx => {
      ctx.shell.contribute('back', { id: 'canvas', render })
      ctx.shell.contribute('say', sayItem('session'))
    })
    expect(shell.items('back').map(item => item.id)).toEqual(['canvas'])
    expect(shell.items('say').map(item => item.id)).toEqual(['session'])
  })

  it('tells the watchers of the place when the item comes and when it leaves', async () => {
    const { root, shell } = await startShell()
    let told = 0
    shell.subscribe('say', () => (told += 1))
    const fiber = await place(root, 'a', ctx => ctx.shell.contribute('say', sayItem('session')))
    expect(told).toBe(1)
    await fiber.dispose()
    await settle()
    expect(told).toBe(2)
    expect(shell.items('say')).toEqual([])
  })

  it('places an item that knows pictures as it places one that does not, and the shell reads back its pictures as given', async () => {
    const { root, shell } = await startShell()
    const pictures = (scope: string | undefined): boolean => scope === 'tenant'
    const item: SayItem = { ...sayItem('session'), pictures }
    await place(root, 'a', ctx => ctx.shell.contribute('say', item))
    expect(shell.items('say')).toEqual([item])
    expect(shell.items('say')[0]?.pictures).toBe(pictures)
  })

  it('is a point of the shell with major version 1 and revision 2, fixed when the app is built, whose item gives five functions and may give a sixth', () => {
    const contract = shellContracts.find(each => each.name === 'shell.say')
    expect(contract).toMatchObject({
      tree: 'client',
      arity: 'one',
      key: 'none',
      resolve: 'conflict',
      binding: 'build',
      version: 1,
      revision: 2,
      item: {
        kind: 'pure',
        fields: {
          targets: 'function',
          current: 'function',
          subscribe: 'function',
          say: 'function',
          show: 'function',
        },
      },
    })
    expect(Object.keys(contract?.item.fields ?? {})).not.toContain('pictures')
  })
})
