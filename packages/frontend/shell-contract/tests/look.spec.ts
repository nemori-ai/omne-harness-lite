import { Context, type Fiber } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  LAYOUT_POINT,
  RENDER_POINT,
  STYLE_POINT,
  TOKENS_POINT,
  definePart,
  defineRenderPoint,
  lookScope,
  tenantScope,
  type PartDeclaration,
} from '@omne-harness/shell-contract'
import { ReferenceShell, render, startShellOf } from '@omne-harness/shell-contract/testing'

type Note = Readonly<{ words: string }>

const app: PartDeclaration = {
  name: 'shell.app',
  label: '整个应用',
  summary: '窗口里的一切',
  depths: ['tokens', 'style'],
}
const message = definePart<Note>({
  name: 'notes.message',
  label: '一条笔记',
  summary: '写下的一条',
  depths: ['tokens', 'style', 'render'],
})
const calls = defineRenderPoint<Note>({
  title: 'test',
  name: 'notes.tool-call',
  key: 'the name of the tool',
  summary: 'How a call of one tool is drawn.',
})

const ALICE = '{"organization":"org_1","account":"acc_alice"}'
const BOB = '{"organization":"org_1","account":"acc_bob"}'
const alice = tenantScope(ALICE)
const sea = lookScope(ALICE, 'sea')
const ink = lookScope(ALICE, 'ink')
const MESSAGE = '[data-omne-part="notes.message"]'
const LAYER = (rules: string): string => `@layer omne-changes{${rules}}`

class Framed extends ReferenceShell {
  constructor(ctx: Context) {
    super(ctx)
    this.declareOwn([app])
  }

  show(tenant: string | undefined): void {
    this.tenant = tenant
    this.rescope()
  }

  protected override knowsToken(name: string): boolean {
    return name === '--omne-accent'
  }
}

function place(root: Context, name: string, put: (ctx: Context) => void): Fiber {
  return root.plugin({ name, inject: ['shell'], apply: put })
}

const page = (id: string, order: number) => ({ id, title: id, order, icon: 'topics', render })

/** One key of each way to change the interface, put four times: for everyone, for the tenant, and for each of two looks. */
async function world() {
  const started = await startShellOf(Framed)
  const { root, shell } = started
  shell.show(ALICE)
  await place(root, 'notes-ui', ctx => {
    message.declare(ctx.shell)
    calls.declare(ctx.shell)
    ctx.shell.contribute('pages', page('chat', 0))
    ctx.shell.contribute('pages', page('assets', 10))
    ctx.shell.contribute('pages', page('settings', 20))
  })
  const put = (name: string, scope: readonly string[], order: readonly string[]) =>
    place(root, name, ctx => {
      ctx.shell.putTokens('shell.app', { '--omne-accent': `var(--${name})` }, scope)
      ctx.shell.putStyle('notes.message', { base: { color: `var(--${name})` } }, scope)
      ctx.shell.putLayout('shell.pages', order, scope)
      ctx.shell.putRender('notes.message', () => `${name}:part`, scope)
      calls.put(ctx.shell, 'files.write', () => `${name}:call`, scope)
    })
  await put('own', alice, ['settings'])
  await put('sea', sea, ['assets'])
  await put('ink', ink, ['settings', 'assets'])
  const seen = () => {
    const read = shell.changes()
    return {
      accent: read.app['--omne-accent'],
      css: read.css,
      pages: shell.items('pages').map(item => item.id),
      part: message.draw(shell, () => 'built-in', { words: '' }),
      call: calls.draw(shell, 'files.write', { words: '' }, () => 'generic'),
      by: Object.fromEntries(read.standing.map(item => [item.point, item.by])),
      conflicts: read.conflicts,
      refused: read.refused,
    }
  }
  return { ...started, seen }
}

const from = (name: string, pages: readonly string[]) => ({
  accent: `var(--${name})`,
  css: LAYER(`:root{--omne-accent:var(--${name});}${MESSAGE}{color:var(--${name});}`),
  pages,
  part: `${name}:part`,
  call: `${name}:call`,
  by: {
    [TOKENS_POINT]: [name],
    [STYLE_POINT]: [name],
    [LAYOUT_POINT]: [name],
    [RENDER_POINT]: [name],
  },
  conflicts: [],
  refused: [],
})

describe('the scope of one who asks under a look', () => {
  it('is the deployment while nobody is signed in, whatever the look', () => {
    expect(lookScope(undefined, undefined)).toEqual([])
    expect(lookScope(undefined, 'sea')).toEqual([])
    expect(lookScope('', 'sea')).toEqual([])
  })

  it('is the scope of the tenant, to the letter, while there is no look', () => {
    expect(lookScope(ALICE, undefined)).toEqual(tenantScope(ALICE))
    expect(lookScope(ALICE, '')).toEqual(tenantScope(ALICE))
  })

  it('is one segment under the tenant with a look: what a tenant put is on its path, another look and another tenant are not', () => {
    expect(sea).toEqual([...alice, 'look', 'sea'])
    expect(sea.slice(0, alice.length)).toEqual(alice)
    expect(ink).not.toEqual(sea)
    expect(lookScope(BOB, 'sea')).not.toEqual(sea)
  })
})

describe('the look the shell wears', () => {
  it('without one, every asking gets what the tenant put: what is put for a look is not seen', async () => {
    const w = await world()
    expect(w.shell.look()).toBeUndefined()
    expect(w.seen()).toEqual(from('own', ['settings', 'chat', 'assets']))
  })

  it('with one, every asking gets what is put for that look, at once: tokens, style, order, the drawing of a part and the drawing by key', async () => {
    const w = await world()
    w.shell.wear('sea')
    expect(w.shell.look()).toBe('sea')
    expect(w.seen()).toEqual(from('sea', ['assets', 'chat', 'settings']))
    w.shell.wear('ink')
    expect(w.seen()).toEqual(from('ink', ['settings', 'assets', 'chat']))
  })

  it('taken off, it is as if no look had been put at all', async () => {
    const w = await world()
    const before = w.seen()
    w.shell.wear('sea')
    w.shell.wear(undefined)
    expect(w.seen()).toEqual(before)
  })

  it('a look nothing is put for shows what the tenant put', async () => {
    const w = await world()
    w.shell.wear('none-such')
    expect(w.seen()).toEqual(from('own', ['settings', 'chat', 'assets']))
  })

  it('what is put for a look of one tenant is not seen by another tenant wearing a look of that name', async () => {
    const w = await world()
    w.shell.wear('sea')
    w.shell.show(BOB)
    expect(w.seen()).toMatchObject({
      accent: undefined,
      css: LAYER(''),
      pages: ['chat', 'assets', 'settings'],
      part: 'built-in',
      call: 'generic',
    })
  })

  it('nobody signed in wears nothing, whatever was named', async () => {
    const w = await world()
    w.shell.wear('sea')
    w.shell.show(undefined)
    expect(w.seen()).toMatchObject({ accent: undefined, part: 'built-in', call: 'generic' })
  })

  it('tells who watches the changes and the pages when the look changes, and nobody when it is named again', async () => {
    const w = await world()
    let changes = 0
    let pages = 0
    w.shell.watchChanges(() => changes++)
    w.shell.subscribe('pages', () => pages++)
    w.shell.wear('sea')
    expect([changes, pages]).toEqual([1, 1])
    w.shell.wear('sea')
    expect([changes, pages]).toEqual([1, 1])
    w.shell.wear(undefined)
    expect([changes, pages]).toEqual([2, 2])
  })

  it('gives the same reading while the registry, the tenant and the look stand', async () => {
    const w = await world()
    w.shell.wear('sea')
    const read = w.shell.changes()
    expect(w.shell.changes()).toBe(read)
    w.shell.wear('ink')
    expect(w.shell.changes()).not.toBe(read)
  })

  it('answers for any scope asked, whatever it wears: what is put for a look is judged as one wearing it would get it', async () => {
    const w = await world()
    await place(w.root, 'odd', ctx => {
      ctx.shell.putTokens('shell.app', { '--omne-nothing': '1px' }, lookScope(ALICE, 'odd'))
    })
    expect(w.shell.changes().refused).toEqual([])
    expect(w.shell.changesFor(lookScope(ALICE, 'odd')).refused.map(item => item.by)).toEqual([
      'odd',
    ])
    expect(w.shell.changesFor(sea).app['--omne-accent']).toBe('var(--sea)')
    expect(w.shell.look()).toBeUndefined()
  })

  it('a part of the shell opens no drawing to what is put for a look either', async () => {
    const w = await world()
    await place(w.root, 'bold', ctx => void ctx.shell.putRender('shell.app', () => 'mine', sea))
    w.shell.wear('sea')
    expect(w.shell.changes().refused.map(item => [item.point, item.key, item.by])).toEqual([
      [RENDER_POINT, 'shell.app', 'bold'],
    ])
  })
})
