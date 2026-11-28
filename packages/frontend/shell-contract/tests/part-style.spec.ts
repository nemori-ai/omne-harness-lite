import { Context, type Fiber } from '@deepseek-ai/cordis'
import type { Scope } from '@omne-harness/dynamis'
import { describe, expect, it } from 'vitest'
import {
  STYLE_POINT,
  TOKENS_POINT,
  changesOn,
  definePart,
  tenantScope,
  type PartDeclaration,
} from '@omne-harness/shell-contract'
import { ReferenceShell, startShellOf } from '@omne-harness/shell-contract/testing'

const app: PartDeclaration = {
  name: 'shell.app',
  label: '整个应用',
  summary: '窗口里的一切',
  depths: ['tokens', 'style'],
}
const send: PartDeclaration = {
  name: 'notes.composer.send',
  label: '发送按钮',
  summary: '把写好的一条发出去',
  depths: ['tokens', 'style'],
}
const title: PartDeclaration = {
  name: 'notes.title',
  label: '标题',
  summary: '这一页的名字',
  depths: ['tokens'],
}

const known = (name: string): boolean => name === '--omne-accent'
const ALICE = '{"organization":"org_1","account":"acc_alice"}'
const alice = tenantScope(ALICE)
const SEND = '[data-omne-part="notes.composer.send"]'

class Framed extends ReferenceShell {
  constructor(ctx: Context) {
    super(ctx)
    this.declareOwn([app])
  }
}

function place(root: Context, name: string, put: (ctx: Context) => void): Fiber {
  return root.plugin({ name, inject: ['shell'], apply: put })
}

async function world() {
  const started = await startShellOf(Framed)
  await place(started.root, 'notes-ui', ctx => {
    definePart(send).declare(ctx.shell)
    definePart(title).declare(ctx.shell)
  })
  const read = (asker: Scope = alice) => changesOn(started.shell.registry(), asker, known)
  return { ...started, read }
}

const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 5))
const LAYER = (rules: string): string => `@layer omne-changes{${rules}}`

describe('the declarations put on a part', () => {
  it('are written on the elements that carry its name: at rest, and one rule for each state given', async () => {
    const w = await world()
    await place(
      w.root,
      'brand',
      ctx =>
        void ctx.shell.putStyle(
          'notes.composer.send',
          {
            hover: { 'background-color': '#0a7' },
            base: { 'padding-inline': ' 20px ', 'border-radius': '999px' },
          },
          alice,
        ),
    )
    const read = w.read()
    expect(read.css).toBe(
      LAYER(
        `${SEND}{border-radius:999px;padding-inline:20px;}` +
          `${SEND}:hover{background-color:#0a7;}`,
      ),
    )
    expect(read.standing.filter(item => item.point === STYLE_POINT)).toEqual([
      {
        point: STYLE_POINT,
        key: 'notes.composer.send',
        by: ['brand'],
        scope: alice,
        builtIn: false,
      },
    ])
    expect(read.refused).toEqual([])
  })

  it('every state has its own selector, and the rules come in one order whatever order they were written in', async () => {
    const w = await world()
    const colour = (value: string) => ({ color: value })
    await place(
      w.root,
      'brand',
      ctx =>
        void ctx.shell.putStyle(
          'notes.composer.send',
          {
            disabled: colour('#777'),
            open: colour('#666'),
            selected: colour('#555'),
            active: colour('#444'),
            'focus-visible': colour('#333'),
            hover: colour('#222'),
            base: colour('#111'),
          },
          alice,
        ),
    )
    expect(w.read().css).toBe(
      LAYER(
        [
          `${SEND}{color:#111;}`,
          `${SEND}:hover{color:#222;}`,
          `${SEND}:focus-visible{color:#333;}`,
          `${SEND}:active{color:#444;}`,
          `${SEND}:is([aria-selected="true"],[data-selected="true"],[aria-current="page"],[aria-pressed="true"],[data-state="active"],[data-state="checked"]){color:#555;}`,
          `${SEND}:is([data-state="open"],[aria-expanded="true"]){color:#666;}`,
          `${SEND}:is(:disabled,[aria-disabled="true"],[data-disabled]){color:#777;}`,
        ].join(''),
      ),
    )
  })

  it('the tokens of the parts come before the declarations, and the whole application is the root', async () => {
    const w = await world()
    await place(w.root, 'brand', ctx => {
      ctx.shell.putStyle('notes.composer.send', { base: { color: '#111' } }, alice)
      ctx.shell.putStyle('shell.app', { base: { 'letter-spacing': '0.01em' } }, alice)
      ctx.shell.putTokens('notes.composer.send', { '--omne-accent': '#0a7' }, alice)
    })
    expect(w.read().css).toBe(
      LAYER(
        `${SEND}{--omne-accent:#0a7;}` + ':root{letter-spacing:0.01em;}' + `${SEND}{color:#111;}`,
      ),
    )
  })

  it('taken back, the sheet is as it was; a style with nothing in it writes nothing', async () => {
    const w = await world()
    const before = w.read()
    let take: (() => unknown) | undefined
    await place(w.root, 'brand', ctx => {
      take = ctx.shell.putStyle('notes.composer.send', { base: { color: '#111' } }, alice)
    })
    expect(w.read().css).not.toBe(before.css)
    await take?.()
    await settle()
    expect(w.read()).toEqual(before)
    await place(
      w.root,
      'empty',
      ctx => void ctx.shell.putStyle('notes.composer.send', { base: {} }, alice),
    )
    expect(w.read().css).toBe(before.css)
  })

  it('the same style put by two modules is one item, whatever order each wrote it in; two different ones are a conflict', async () => {
    const w = await world()
    await place(
      w.root,
      'a',
      ctx =>
        void ctx.shell.putStyle(
          'notes.composer.send',
          { base: { color: '#111', margin: '0' }, hover: { color: '#222' } },
          alice,
        ),
    )
    const same = await place(
      w.root,
      'b',
      ctx =>
        void ctx.shell.putStyle(
          'notes.composer.send',
          { hover: { color: '#222' }, base: { margin: '0', color: '#111' } },
          alice,
        ),
    )
    expect(w.read().conflicts).toEqual([])
    await same.dispose()
    await place(
      w.root,
      'c',
      ctx => void ctx.shell.putStyle('notes.composer.send', { base: { color: '#999' } }, alice),
    )
    await settle()
    const read = w.read()
    expect(read.conflicts).toEqual([
      { point: STYLE_POINT, key: 'notes.composer.send', by: ['a', 'c'] },
    ])
    expect(read.css).toBe(LAYER(''))
  })

  it('what a tenant put is over what holds for the whole deployment', async () => {
    const w = await world()
    await place(
      w.root,
      'operator',
      ctx => void ctx.shell.putStyle('notes.composer.send', { base: { color: '#111' } }),
    )
    await place(
      w.root,
      'brand',
      ctx => void ctx.shell.putStyle('notes.composer.send', { base: { color: '#222' } }, alice),
    )
    expect(w.read().css).toBe(LAYER(`${SEND}{color:#222;}`))
    expect(w.read(tenantScope(undefined)).css).toBe(LAYER(`${SEND}{color:#111;}`))
  })

  it.each([
    [
      { pressed: { color: '#111' } },
      'the state pressed is not one of hover, focus-visible, active, selected, open, disabled',
    ],
    [{ base: { Color: '#111' } }, 'Color is not the name of a property'],
    [{ base: { 'color;x': '#111' } }, 'color;x is not the name of a property'],
    [
      { base: { '--omne-accent': '#111' } },
      '--omne-accent is a token: tokens are put on shell.tokens',
    ],
    [
      { base: { color: 'url(x.png)' } },
      'the property color: the value calls url(, which a value may not call',
    ],
    [
      { hover: { color: 'red; x' } },
      'in hover, the property color: the value has ";", which a value may not have',
    ],
    [{ base: { color: 7 } }, 'the property color has no text for a value'],
    [{ hover: 'red' }, 'the state hover has no declarations'],
    [{ hover: null }, 'the state hover has no declarations'],
    [
      { zeta: { color: '#111' }, alpha: { color: '#111' } },
      'the state alpha is not one of hover, focus-visible, active, selected, open, disabled',
    ],
    [{ base: { 'z;': '1', 'a;': '1' } }, 'a; is not the name of a property'],
  ])('a style the rule refuses does not count: %j', async (style, reason) => {
    const w = await world()
    await place(
      w.root,
      'operator',
      ctx => void ctx.shell.putStyle('notes.composer.send', { base: { color: '#111' } }),
    )
    await place(
      w.root,
      'brand',
      ctx => void ctx.shell.putStyle('notes.composer.send', style as never, alice),
    )
    const read = w.read()
    expect(read.refused).toEqual([
      { point: STYLE_POINT, key: 'notes.composer.send', by: 'brand', scope: alice, reason },
    ])
    expect(read.css).toBe(LAYER(`${SEND}{color:#111;}`))
  })

  it('a part that does not open style, and a name nobody declared, take no style; what does not count is listed by point', async () => {
    const w = await world()
    await place(w.root, 'brand', ctx => {
      ctx.shell.putStyle('notes.title', { base: { color: '#111' } }, alice)
      ctx.shell.putStyle('notes.nowhere', { base: { color: '#111' } }, alice)
      ctx.shell.putTokens('notes.nowhere', { '--omne-accent': '#0a7' }, alice)
    })
    const read = w.read()
    expect(read.css).toBe(LAYER(''))
    expect(read.refused.map(item => [item.point, item.key, item.reason])).toEqual([
      [STYLE_POINT, 'notes.nowhere', 'no part is declared as notes.nowhere'],
      [STYLE_POINT, 'notes.title', 'the part notes.title does not open style'],
      [TOKENS_POINT, 'notes.nowhere', 'no part is declared as notes.nowhere'],
    ])
  })
})
