import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { ShellAssemblyError, type SlotName } from '@omne-harness/shell-contract'
import { render, startShell } from './reference-shell.ts'

const gate = (id: string) => ({ id, render })
const page = (id: string, order = 0) => ({ id, title: id, order, render })
const side = (id: string, order = 0) => ({ id, order, render })

async function place(root: Context, name: string, put: (ctx: Context) => void): Promise<void> {
  await root.plugin({
    name,
    inject: ['shell'],
    apply: put,
  })
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

describe('contribute', () => {
  describe('a slot that holds one', () => {
    it('places into an empty slot', async () => {
      const { root, shell } = await startShell()
      await place(root, 'a', ctx => ctx.shell.contribute('gate', gate('login')))
      expect(shell.items('gate').map(item => item.id)).toEqual(['login'])
    })

    it('throws when the slot holds an item with another id', async () => {
      const { root, shell } = await startShell()
      await place(root, 'a', ctx => ctx.shell.contribute('gate', gate('login')))
      const error = await failure(root, ctx => ctx.shell.contribute('gate', gate('other')))
      expect(error).toBeInstanceOf(ShellAssemblyError)
      expect(error).toMatchObject({ slot: 'gate', id: 'other', reason: 'occupied' })
      expect(shell.items('gate').map(item => item.id)).toEqual(['login'])
    })

    it('throws when the slot holds an item with the same id', async () => {
      const { root, shell } = await startShell()
      await place(root, 'a', ctx => ctx.shell.contribute('gate', gate('login')))
      const error = await failure(root, ctx => ctx.shell.contribute('gate', gate('login')))
      expect(error).toMatchObject({ slot: 'gate', id: 'login', reason: 'occupied' })
      expect(shell.items('gate')).toHaveLength(1)
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

    it('throws when the slot holds an item with the same id', async () => {
      const { root, shell } = await startShell()
      await place(root, 'a', ctx => ctx.shell.contribute('sidebar', side('list')))
      const error = await failure(root, ctx => ctx.shell.contribute('sidebar', side('list')))
      expect(error).toBeInstanceOf(ShellAssemblyError)
      expect(error).toMatchObject({ slot: 'sidebar', id: 'list', reason: 'duplicate' })
      expect(shell.items('sidebar')).toHaveLength(1)
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

  it('names the slot and the id in the error message', () => {
    const slot: SlotName = 'gate'
    expect(new ShellAssemblyError(slot, 'a', 'occupied').message).toBe(
      'slot gate already holds an item; cannot place a',
    )
    expect(new ShellAssemblyError('pages', 'a', 'duplicate').message).toBe(
      'slot pages already holds an item with id a',
    )
    expect(new ShellAssemblyError(slot, 'a', 'occupied').name).toBe('ShellAssemblyError')
  })
})
