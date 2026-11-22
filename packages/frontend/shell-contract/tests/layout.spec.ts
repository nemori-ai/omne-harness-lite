import { Context, type Fiber } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { LAYOUT_POINT, tenantScope } from '@omne-harness/shell-contract'
import { ReferenceShell, render, startShellOf } from '@omne-harness/shell-contract/testing'

const ALICE = '{"organization":"org_1","account":"acc_alice"}'
const BOB = '{"organization":"org_1","account":"acc_bob"}'
const alice = tenantScope(ALICE)

class Showing extends ReferenceShell {
  show(tenant: string | undefined): void {
    this.tenant = tenant
    this.rescope()
  }
}

function place(root: Context, name: string, put: (ctx: Context) => void): Fiber {
  return root.plugin({ name, inject: ['shell'], apply: put })
}

const page = (id: string, order: number) => ({ id, title: id, order, icon: 'topics', render })

async function world() {
  const started = await startShellOf(Showing)
  started.shell.show(ALICE)
  await place(started.root, 'pages', ctx => {
    for (const [id, order] of [
      ['chat', 0],
      ['decisions', 10],
      ['notifications', 11],
      ['settings', 20],
    ] as const)
      ctx.shell.contribute('pages', page(id, order))
  })
  const ids = () => started.shell.items('pages').map(item => item.id)
  return { ...started, ids }
}

const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 5))

describe('the order of the pages', () => {
  it('is the order the modules gave, while nobody put a layout', async () => {
    const w = await world()
    expect(w.ids()).toEqual(['chat', 'decisions', 'notifications', 'settings'])
  })

  it('follows a layout put on it: the pages it names come first in its order, the rest keep theirs', async () => {
    const w = await world()
    let told = 0
    w.shell.subscribe('pages', () => {
      told += 1
    })
    let take: (() => unknown) | undefined
    await place(w.root, 'brand', ctx => {
      take = ctx.shell.putLayout('shell.pages', ['notifications', 'gone', 'chat'], alice)
    })
    expect(w.ids()).toEqual(['notifications', 'chat', 'decisions', 'settings'])
    expect(told).toBe(1)
    expect(w.shell.changes().standing.filter(item => item.point === LAYOUT_POINT)).toEqual([
      { point: LAYOUT_POINT, key: 'shell.pages', by: ['brand'], scope: alice, builtIn: false },
    ])
    await take?.()
    await settle()
    expect(w.ids()).toEqual(['chat', 'decisions', 'notifications', 'settings'])
    expect(told).toBe(2)
  })

  it('is the layout of the tenant on show: another tenant, and nobody signed in, see the order the modules gave', async () => {
    const w = await world()
    await place(
      w.root,
      'brand',
      ctx => void ctx.shell.putLayout('shell.pages', ['settings'], alice),
    )
    expect(w.ids()).toEqual(['settings', 'chat', 'decisions', 'notifications'])
    w.shell.show(BOB)
    expect(w.ids()).toEqual(['chat', 'decisions', 'notifications', 'settings'])
    w.shell.show(undefined)
    expect(w.ids()).toEqual(['chat', 'decisions', 'notifications', 'settings'])
    w.shell.show(ALICE)
    expect(w.ids()).toEqual(['settings', 'chat', 'decisions', 'notifications'])
  })

  it('orders the pages only: what sits in the sidebar under the same ids keeps its order', async () => {
    const w = await world()
    await place(w.root, 'side', ctx => {
      ctx.shell.contribute('sidebar', { id: 'chat', order: 0, render })
      ctx.shell.contribute('sidebar', { id: 'settings', order: 1, render })
    })
    await place(
      w.root,
      'brand',
      ctx => void ctx.shell.putLayout('shell.pages', ['settings'], alice),
    )
    expect(w.ids()).toEqual(['settings', 'chat', 'decisions', 'notifications'])
    expect(w.shell.items('sidebar').map(item => item.id)).toEqual(['chat', 'settings'])
  })

  it('two layouts at one scope are a conflict, and the pages keep the order the modules gave', async () => {
    const w = await world()
    await place(w.root, 'a', ctx => void ctx.shell.putLayout('shell.pages', ['settings'], alice))
    await place(
      w.root,
      'b',
      ctx => void ctx.shell.putLayout('shell.pages', ['notifications'], alice),
    )
    expect(w.ids()).toEqual(['chat', 'decisions', 'notifications', 'settings'])
    expect(w.shell.changes().conflicts).toEqual([
      { point: LAYOUT_POINT, key: 'shell.pages', by: ['a', 'b'] },
    ])
  })

  it.each([
    ['shell.sidebar', ['a'], 'there is nothing to lay out under shell.sidebar'],
    ['shell.pages', ['chat', 7], 'the order names 7, which is not the id of a page'],
    ['shell.pages', ['chat', ''], 'the order names "", which is not the id of a page'],
    ['shell.pages', ['chat', 'settings', 'chat'], 'the order names chat twice'],
  ])('a layout the rule refuses does not count: %s %j', async (key, order, reason) => {
    const w = await world()
    await place(w.root, 'operator', ctx => void ctx.shell.putLayout('shell.pages', ['settings']))
    await place(w.root, 'brand', ctx => void ctx.shell.putLayout(key, order as never, alice))
    expect(w.ids()).toEqual(['settings', 'chat', 'decisions', 'notifications'])
    expect(
      w.shell.changes().refused.map(item => [item.point, item.key, item.by, item.reason]),
    ).toEqual([[LAYOUT_POINT, key, 'brand', reason]])
  })
})
