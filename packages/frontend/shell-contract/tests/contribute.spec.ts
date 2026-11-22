import { Context, type Fiber } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { ShellAssemblyError, type SlotName } from '@omne-harness/shell-contract'
import { render, startShell } from './reference-shell.ts'

const gate = (id: string) => ({ id, render })
const page = (id: string, order = 0) => ({ id, title: id, order, icon: 'topics', render })
const side = (id: string, order = 0) => ({ id, order, render })
const attached = (id: string, anchor: string, order = 0) => ({ id, order, anchor, render })

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

describe('contribute', () => {
  describe('the gate, which holds one', () => {
    it('places into an empty slot', async () => {
      const { root, shell } = await startShell()
      await place(root, 'a', ctx => ctx.shell.contribute('gate', gate('login')))
      expect(shell.items('gate').map(item => item.id)).toEqual(['login'])
      expect(shell.conflicts('gate')).toEqual([])
    })

    it('answers a conflict when another module puts a gate: neither is drawn, both are named', async () => {
      const { root, shell } = await startShell()
      await place(root, 'a', ctx => ctx.shell.contribute('gate', gate('login')))
      const second = await place(root, 'b', ctx => ctx.shell.contribute('gate', gate('other')))
      expect(shell.items('gate')).toEqual([])
      expect(shell.conflicts('gate')).toEqual([
        { slot: 'gate', anchor: undefined, id: '', by: ['a', 'b'] },
      ])
      await second.dispose()
      await settle()
      expect(shell.items('gate').map(item => item.id)).toEqual(['login'])
      expect(shell.conflicts('gate')).toEqual([])
    })

    it('throws when one module puts a second gate, and nothing of that module shows', async () => {
      const { root, shell } = await startShell()
      const error = await failure(root, ctx => {
        ctx.shell.contribute('gate', gate('login'))
        ctx.shell.contribute('gate', gate('other'))
      })
      expect(error).toBeInstanceOf(ShellAssemblyError)
      expect(error).toMatchObject({ slot: 'gate', id: 'other', reason: 'duplicate' })
      await settle()
      expect(shell.items('gate')).toEqual([])
    })
  })

  describe('a slot that holds a list', () => {
    it('places into an empty slot', async () => {
      const { root, shell } = await startShell()
      await place(root, 'a', ctx => ctx.shell.contribute('pages', page('chat')))
      expect(shell.items('pages').map(item => item.id)).toEqual(['chat'])
    })

    it('places beside an item with another id', async () => {
      const { root, shell } = await startShell()
      await place(root, 'a', ctx => ctx.shell.contribute('pages', page('chat')))
      await place(root, 'b', ctx => ctx.shell.contribute('pages', page('settings')))
      expect(shell.items('pages').map(item => item.id)).toEqual(['chat', 'settings'])
    })

    it('answers a conflict when another module puts the same id: neither is drawn, the rest stays', async () => {
      const { root, shell } = await startShell()
      await place(root, 'a', ctx => {
        ctx.shell.contribute('sidebar', side('list'))
        ctx.shell.contribute('sidebar', side('own'))
      })
      const second = await place(root, 'b', ctx => ctx.shell.contribute('sidebar', side('list')))
      expect(shell.items('sidebar').map(item => item.id)).toEqual(['own'])
      expect(shell.conflicts('sidebar')).toEqual([
        { slot: 'sidebar', anchor: undefined, id: 'list', by: ['a', 'b'] },
      ])
      await second.dispose()
      await settle()
      expect(shell.items('sidebar').map(item => item.id)).toEqual(['list', 'own'])
      expect(shell.conflicts('sidebar')).toEqual([])
    })

    it('answers the same whichever module was loaded first', async () => {
      const forward = await startShell()
      const backward = await startShell()
      const first = (ctx: Context): void => ctx.shell.contribute('pages', page('chat'))
      const second = (ctx: Context): void => ctx.shell.contribute('pages', page('chat'))
      await place(forward.root, 'a', first)
      await place(forward.root, 'b', second)
      await place(backward.root, 'b', second)
      await place(backward.root, 'a', first)
      expect(forward.shell.conflicts('pages')).toEqual(backward.shell.conflicts('pages'))
      expect(forward.shell.items('pages')).toEqual([])
      expect(backward.shell.items('pages')).toEqual([])
    })

    it('throws when one module puts the same id twice', async () => {
      const { root, shell } = await startShell()
      const error = await failure(root, ctx => {
        ctx.shell.contribute('sidebar', side('list'))
        ctx.shell.contribute('sidebar', side('list'))
      })
      expect(error).toBeInstanceOf(ShellAssemblyError)
      expect(error).toMatchObject({ slot: 'sidebar', id: 'list', reason: 'duplicate' })
      await settle()
      expect(shell.items('sidebar')).toEqual([])
    })
  })

  describe('the attached slot, which holds a list', () => {
    it('places into an empty slot', async () => {
      const { root, shell } = await startShell()
      await place(root, 'a', ctx => ctx.shell.contribute('attached', attached('card', 'test.chat')))
      expect(shell.items('attached').map(item => item.id)).toEqual(['card'])
    })

    it('places beside an item with another id', async () => {
      const { root, shell } = await startShell()
      await place(root, 'a', ctx => ctx.shell.contribute('attached', attached('card', 'test.chat')))
      await place(root, 'b', ctx => ctx.shell.contribute('attached', attached('note', 'test.chat')))
      expect(shell.items('attached').map(item => item.id)).toEqual(['card', 'note'])
    })

    it('answers a conflict when another module puts the same id under the same anchor', async () => {
      const { root, shell } = await startShell()
      await place(root, 'a', ctx => ctx.shell.contribute('attached', attached('card', 'test.chat')))
      await place(root, 'b', ctx => ctx.shell.contribute('attached', attached('card', 'test.chat')))
      expect(shell.items('attached')).toEqual([])
      expect(shell.conflicts('attached')).toEqual([
        { slot: 'attached', anchor: 'test.chat', id: 'card', by: ['a', 'b'] },
      ])
    })

    it('throws when one module puts the same id under the same anchor twice', async () => {
      const { root } = await startShell()
      const error = await failure(root, ctx => {
        ctx.shell.contribute('attached', attached('card', 'test.chat'))
        ctx.shell.contribute('attached', attached('card', 'test.chat'))
      })
      expect(error).toMatchObject({ slot: 'attached', id: 'card', reason: 'duplicate' })
    })

    it('places the same id when the anchors differ', async () => {
      const { root, shell } = await startShell()
      await place(root, 'a', ctx => ctx.shell.contribute('attached', attached('card', 'test.chat')))
      await place(root, 'b', ctx =>
        ctx.shell.contribute('attached', attached('card', 'test.other')),
      )
      expect(shell.items('attached').map(item => item.anchor)).toEqual(['test.chat', 'test.other'])
    })

    it('throws when the anchor is not the name of a point', async () => {
      const { root } = await startShell()
      const error = await failure(root, ctx =>
        ctx.shell.contribute('attached', attached('card', 'chat')),
      )
      expect(error).toBeInstanceOf(ShellAssemblyError)
      expect(error).toMatchObject({ slot: 'attached', id: 'card', reason: 'invalid' })
    })

    it('draws nothing under an anchor nobody declared, and draws it once the point is declared', async () => {
      const { root, shell } = await startShell([])
      await place(root, 'a', ctx => ctx.shell.contribute('attached', attached('card', 'test.chat')))
      expect(shell.items('attached')).toEqual([])
      const { definePoint } = await import('@omne-harness/shell-contract')
      const text = { encode: (value: string) => value, decode: (value: string) => value }
      definePoint({ name: 'test.chat', subject: text }).declare(root.shell)
      expect(shell.items('attached').map(item => item.id)).toEqual(['card'])
    })
  })

  it('keeps ids apart per slot', async () => {
    const { root, shell } = await startShell()
    await place(root, 'a', ctx => {
      ctx.shell.contribute('pages', page('x'))
      ctx.shell.contribute('sidebar', side('x'))
    })
    expect(shell.items('pages')).toHaveLength(1)
    expect(shell.items('sidebar')).toHaveLength(1)
  })

  it('shows nothing of a module whose apply throws, and tells nobody', async () => {
    const { root, shell } = await startShell()
    let notified = 0
    shell.subscribe('pages', () => (notified += 1))
    await failure(root, ctx => {
      ctx.shell.contribute('pages', page('chat'))
      throw new Error('boom')
    })
    await settle()
    expect(shell.items('pages')).toEqual([])
    expect(notified).toBe(0)
  })

  it('shows all a module put at once, when the module is ready', async () => {
    const { root, shell } = await startShell()
    const seen: string[][] = []
    shell.subscribe('pages', () => seen.push(shell.items('pages').map(item => item.id)))
    await place(root, 'a', ctx => {
      ctx.shell.contribute('pages', page('one'))
      ctx.shell.contribute('pages', page('two'))
    })
    expect(seen).toEqual([['one', 'two']])
  })

  it('gives the same array while the slot holds the same items', async () => {
    const { root, shell } = await startShell()
    await place(root, 'a', ctx => ctx.shell.contribute('pages', page('chat')))
    const before = shell.items('pages')
    let notified = 0
    shell.subscribe('pages', () => (notified += 1))
    await place(root, 'b', ctx => ctx.shell.contribute('sidebar', side('list')))
    expect(shell.items('pages')).toBe(before)
    expect(notified).toBe(0)
  })

  it('names the slot, the id and the reason in the error message', () => {
    const slot: SlotName = 'gate'
    expect(new ShellAssemblyError(slot, 'a', 'duplicate', 'why').message).toBe(
      'slot gate, item a: this module already put an item there (why)',
    )
    expect(new ShellAssemblyError('pages', 'a', 'invalid', 'why').message).toBe(
      'slot pages, item a: the item cannot be put there (why)',
    )
    expect(new ShellAssemblyError(slot, 'a', 'invalid', 'why').name).toBe('ShellAssemblyError')
  })
})
