import { Context, type Fiber } from '@deepseek-ai/cordis'
import type { Scope } from '@omne-harness/dynamis'
import { describe, expect, it } from 'vitest'
import {
  TOKENS_POINT,
  changesOn,
  definePart,
  tenantScope,
  valueFault,
  type PartDeclaration,
} from '@omne-harness/shell-contract'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
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
  depths: ['style'],
}

const KNOWN = new Set(['--omne-accent', '--omne-radius-control', '--omne-surface'])
const known = (name: string): boolean => KNOWN.has(name)
const ALICE = '{"organization":"org_1","account":"acc_alice"}'
const BOB = '{"organization":"org_1","account":"acc_bob"}'
const alice = tenantScope(ALICE)

class Framed extends ReferenceShell {
  constructor(ctx: Context) {
    super(ctx)
    this.declareOwn([app, { ...app, name: 'shell.sidebar', label: '侧栏' }])
  }
}

type Put = (ctx: Context) => void

function place(root: Context, name: string, put: Put): Fiber {
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

describe('the value of a token', () => {
  it.each([
    '#0a7',
    'rgb(0 170 119 / 80%)',
    'var(--omne-accent)',
    'calc(4px * 2)',
    '999px',
    'oklch(70% 0.1 160)',
  ])('takes %s', value => {
    expect(valueFault(value)).toBeNull()
  })

  it.each([
    ['url(https://example.test/x.png)', 'the value has ":", which a value may not have'],
    ['url(x.png)', 'the value calls url(, which a value may not call'],
    ['image-set(x 1x)', 'the value calls image-set(, which a value may not call'],
    ['red; background: blue', 'the value has ";", which a value may not have'],
    ['red } body { color: blue', 'the value has "}", which a value may not have'],
    ['red { color: blue', 'the value has "{", which a value may not have'],
    ['@import x', 'the value has "@", which a value may not have'],
    ['</style><script>', 'the value has "<", which a value may not have'],
    ['u\\72l(x)', 'the value has "\\\\", which a value may not have'],
    ['"x"', 'the value has "\\"", which a value may not have'],
    ['red !important', 'the value has "!", which a value may not have'],
    ['  ', 'the value is empty'],
  ])('refuses %s', (value, reason) => {
    expect(valueFault(value)).toBe(reason)
  })
})

describe('the calls a value may make', () => {
  it.each([
    'var(--omne-accent)',
    'calc(1px + 2px)',
    'min(1px, 2px)',
    'max(1px, 2px)',
    'clamp(1px, 2px, 3px)',
    'rgb(0 0 0)',
    'rgba(0, 0, 0, 0.5)',
    'hsl(160 100% 30%)',
    'hsla(160, 100%, 30%, 0.5)',
    'hwb(160 0% 40%)',
    'lab(50% 0 0)',
    'lch(50% 0 0)',
    'oklab(50% 0 0)',
    'oklch(50% 0 0)',
    'color(display-p3 0 1 0)',
    'color-mix(in oklab, #000 50%, #fff)',
    'light-dark(#000, #fff)',
    'RGB(0 0 0)',
  ])('%s', value => {
    expect(valueFault(value)).toBeNull()
  })
})

describe('tokens put on a part', () => {
  it('with nothing put, the layer for changes is there and empty, and the shell stands for the whole application', async () => {
    const w = await world()
    expect(w.read()).toEqual({
      css: LAYER(''),
      standing: [
        { point: TOKENS_POINT, key: 'shell.app', by: ['Framed'], scope: [], builtIn: true },
      ],
      refused: [],
      conflicts: [],
      renders: new Map(),
      layouts: {},
      app: {},
    })
  })

  it('on the whole application they are custom properties of the root; on a part, of the elements that carry its name', async () => {
    const w = await world()
    await place(w.root, 'brand', ctx => {
      ctx.shell.putTokens('shell.app', { '--omne-surface': '#fff', '--omne-accent': '#0a7' }, alice)
      ctx.shell.putTokens('notes.composer.send', { '--omne-radius-control': '999px' }, alice)
    })
    const read = w.read()
    expect(read.css).toBe(
      LAYER(
        ':root{--omne-accent:#0a7;--omne-surface:#fff;}' +
          '[data-omne-part="notes.composer.send"]{--omne-radius-control:999px;}',
      ),
    )
    expect(read.standing).toEqual([
      {
        point: TOKENS_POINT,
        key: 'notes.composer.send',
        by: ['brand'],
        scope: alice,
        builtIn: false,
      },
      { point: TOKENS_POINT, key: 'shell.app', by: ['brand'], scope: alice, builtIn: false },
    ])
    expect(read.refused).toEqual([])
    expect(read.conflicts).toEqual([])
  })

  it('the whole application comes first in the sheet, then the parts by name; a value is written without the space around it', async () => {
    const w = await world()
    await place(w.root, 'notes-extra-ui', ctx =>
      definePart({ ...send, name: 'notes-extra.badge' }).declare(ctx.shell),
    )
    await place(w.root, 'brand', ctx => {
      ctx.shell.putTokens('notes.composer.send', { '--omne-accent': ' #0a7 ' }, alice)
      ctx.shell.putTokens('shell.app', { '--omne-accent': '#07a' }, alice)
      ctx.shell.putTokens('notes-extra.badge', { '--omne-accent': '#a07' }, alice)
      ctx.shell.putTokens('shell.sidebar', {}, alice)
    })
    expect(w.read().css).toBe(
      LAYER(
        ':root{--omne-accent:#07a;}' +
          '[data-omne-part="notes-extra.badge"]{--omne-accent:#a07;}' +
          '[data-omne-part="notes.composer.send"]{--omne-accent:#0a7;}',
      ),
    )
    expect(w.read().standing.map(item => item.key)).toEqual([
      'notes-extra.badge',
      'notes.composer.send',
      'shell.app',
      'shell.sidebar',
    ])
  })

  it('the same tokens put by two modules are one item, whatever order each wrote them in', async () => {
    const w = await world()
    await place(
      w.root,
      'a',
      ctx =>
        void ctx.shell.putTokens(
          'shell.app',
          { '--omne-accent': '#0a7', '--omne-surface': '#fff' },
          alice,
        ),
    )
    await place(
      w.root,
      'b',
      ctx =>
        void ctx.shell.putTokens(
          'shell.app',
          { '--omne-surface': '#fff', '--omne-accent': '#0a7' },
          alice,
        ),
    )
    const read = w.read()
    expect(read.conflicts).toEqual([])
    expect(read.standing.find(item => item.key === 'shell.app')?.by).toEqual(['a', 'b'])
  })

  it('says what the whole application is tinted with for the asker: the tokens that stand on it, and none while only what shipped does', async () => {
    const w = await world()
    expect(w.read().app).toEqual({})
    await place(w.root, 'operator', ctx => {
      ctx.shell.putTokens('notes.composer.send', { '--omne-accent': '#111' }, alice)
    })
    expect(w.read().app).toEqual({})
    const brand = await place(w.root, 'brand', ctx => {
      ctx.shell.putTokens(
        'shell.app',
        { '--omne-accent': ' #0a7 ', '--omne-surface': '#fff' },
        alice,
      )
    })
    expect(w.read().app).toEqual({ '--omne-accent': '#0a7', '--omne-surface': '#fff' })
    expect(w.read(tenantScope(BOB)).app).toEqual({})
    await place(w.root, 'bad', ctx => {
      ctx.shell.putTokens('shell.app', { '--omne-accent': 'url(x)' }, tenantScope(BOB))
    })
    expect(w.read(tenantScope(BOB)).app).toEqual({})
    await brand.dispose()
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(w.read().app).toEqual({})
  })

  it('taken back, what the application shipped with stands again, and the sheet is as it was', async () => {
    const w = await world()
    const before = w.read()
    let take: (() => unknown) | undefined
    await place(w.root, 'brand', ctx => {
      take = ctx.shell.putTokens('shell.app', { '--omne-accent': '#0a7' }, alice)
    })
    expect(w.read().css).not.toBe(before.css)
    await take?.()
    await settle()
    expect(w.read()).toEqual(before)
  })

  it('unloading the module that put them takes them back too', async () => {
    const w = await world()
    const before = w.read()
    const fiber = place(
      w.root,
      'brand',
      ctx => void ctx.shell.putTokens('shell.app', { '--omne-accent': '#0a7' }, alice),
    )
    await fiber
    await fiber.dispose()
    await settle()
    expect(w.read()).toEqual(before)
  })

  it('what a tenant put is not seen by another tenant, nor before anyone is signed in', async () => {
    const w = await world()
    await place(
      w.root,
      'brand',
      ctx => void ctx.shell.putTokens('shell.app', { '--omne-accent': '#0a7' }, alice),
    )
    expect(w.read(tenantScope(BOB)).css).toBe(LAYER(''))
    expect(w.read(tenantScope(undefined)).css).toBe(LAYER(''))
    expect(tenantScope(undefined)).toEqual([])
    expect(alice).toEqual(['tenant', ALICE])
  })

  it('the more specific of two stands: what a tenant put is over what holds for the whole deployment', async () => {
    const w = await world()
    await place(
      w.root,
      'operator',
      ctx => void ctx.shell.putTokens('notes.composer.send', { '--omne-radius-control': '2px' }),
    )
    expect(w.read().css).toBe(
      LAYER('[data-omne-part="notes.composer.send"]{--omne-radius-control:2px;}'),
    )
    await place(
      w.root,
      'brand',
      ctx =>
        void ctx.shell.putTokens(
          'notes.composer.send',
          { '--omne-radius-control': '999px' },
          alice,
        ),
    )
    expect(w.read().css).toBe(
      LAYER('[data-omne-part="notes.composer.send"]{--omne-radius-control:999px;}'),
    )
    expect(w.read(tenantScope(BOB)).css).toBe(
      LAYER('[data-omne-part="notes.composer.send"]{--omne-radius-control:2px;}'),
    )
  })

  it('two different ones at one scope are a conflict: neither counts, what shipped shows, both are named', async () => {
    const w = await world()
    await place(
      w.root,
      'a',
      ctx => void ctx.shell.putTokens('notes.composer.send', { '--omne-accent': '#0a7' }, alice),
    )
    const second = await place(
      w.root,
      'b',
      ctx => void ctx.shell.putTokens('notes.composer.send', { '--omne-accent': '#07a' }, alice),
    )
    const read = w.read()
    expect(read.css).toBe(LAYER(''))
    expect(read.conflicts).toEqual([
      { point: TOKENS_POINT, key: 'notes.composer.send', by: ['a', 'b'] },
    ])
    await second.dispose()
    await settle()
    expect(w.read().css).toBe(LAYER('[data-omne-part="notes.composer.send"]{--omne-accent:#0a7;}'))
  })

  it('for the whole deployment on the whole application is a conflict with what shipped, so what shipped shows', async () => {
    const w = await world()
    await place(
      w.root,
      'operator',
      ctx => void ctx.shell.putTokens('shell.app', { '--omne-accent': '#0a7' }),
    )
    const read = w.read()
    expect(read.css).toBe(LAYER(''))
    expect(read.conflicts).toEqual([
      { point: TOKENS_POINT, key: 'shell.app', by: ['Framed', 'operator'] },
    ])
  })

  it('one the rule refuses does not count and says why; a sound one under it still stands', async () => {
    const w = await world()
    await place(
      w.root,
      'operator',
      ctx => void ctx.shell.putTokens('notes.composer.send', { '--omne-accent': '#0a7' }),
    )
    await place(w.root, 'brand', ctx => {
      ctx.shell.putTokens('notes.composer.send', { '--omne-accent': 'url(x.png)' }, alice)
      ctx.shell.putTokens('notes.title', { '--omne-accent': '#0a7' }, alice)
      ctx.shell.putTokens('notes.nowhere', { '--omne-accent': '#0a7' }, alice)
      ctx.shell.putTokens('shell.app', { '--omne-brand': '#0a7', '--kami-ink': '#000' }, alice)
    })
    const read = w.read()
    expect(read.css).toBe(LAYER('[data-omne-part="notes.composer.send"]{--omne-accent:#0a7;}'))
    expect(read.refused).toEqual([
      {
        point: TOKENS_POINT,
        key: 'notes.composer.send',
        by: 'brand',
        scope: alice,
        reason: 'the token --omne-accent: the value calls url(, which a value may not call',
      },
      {
        point: TOKENS_POINT,
        key: 'notes.nowhere',
        by: 'brand',
        scope: alice,
        reason: 'no part is declared as notes.nowhere',
      },
      {
        point: TOKENS_POINT,
        key: 'notes.title',
        by: 'brand',
        scope: alice,
        reason: 'the part notes.title does not open tokens',
      },
      {
        point: TOKENS_POINT,
        key: 'shell.app',
        by: 'brand',
        scope: alice,
        reason: '--kami-ink is not a token of the interface',
      },
    ])
    expect(read.standing.map(item => [item.key, item.by, item.builtIn])).toEqual([
      ['notes.composer.send', ['operator'], false],
      ['shell.app', ['Framed'], true],
    ])
  })

  it('a token whose value is not text does not count', async () => {
    const w = await world()
    await place(
      w.root,
      'brand',
      ctx => void ctx.shell.putTokens('shell.app', { '--omne-accent': 7 as never }, alice),
    )
    expect(w.read().refused.map(item => item.reason)).toEqual([
      'the token --omne-accent has no text for a value',
    ])
  })

  it('what does not count is listed by key and then by who put it, whichever rule refused it', async () => {
    const w = await world()
    await w.root.plugin({
      name: 'odd',
      inject: ['dynamis'],
      apply: (ctx: Context) =>
        void ctx.dynamis.put([
          {
            point: TOKENS_POINT,
            key: 'shell.app',
            id: '',
            scope: alice,
            rank: 0,
            digest: 'x',
            item: {},
          },
        ]),
    })
    await place(w.root, 'b', ctx => void ctx.shell.putTokens('notes.nowhere', {}, alice))
    await place(
      w.root,
      'a',
      ctx => void ctx.shell.putTokens('notes.nowhere', { '--omne-accent': '#0a7' }, alice),
    )
    expect(w.read().refused.map(item => [item.key, item.by])).toEqual([
      ['notes.nowhere', 'a'],
      ['notes.nowhere', 'b'],
      ['shell.app', 'odd'],
    ])
  })

  it('on a tree where no shell declared the points, there is nothing: an empty layer and no standing', async () => {
    const root = new Context()
    await root.plugin(DynamisService)
    expect(changesOn(root.dynamis.registry(), alice, known)).toEqual({
      css: LAYER(''),
      standing: [],
      refused: [],
      conflicts: [],
      renders: new Map(),
      layouts: {},
      app: {},
    })
  })

  it('a shell that declares parts of its own but not the whole application puts no mark for it', async () => {
    class Partial extends ReferenceShell {
      constructor(ctx: Context) {
        super(ctx)
        this.declareOwn([{ ...app, name: 'shell.sidebar' }])
      }
    }
    const { shell } = await startShellOf(Partial)
    expect(shell.changes()).toEqual({
      css: LAYER(''),
      standing: [],
      refused: [],
      conflicts: [],
      renders: new Map(),
      layouts: {},
      app: {},
    })
  })

  it('nobody signed in, or a tenant with no text, asks as the deployment', () => {
    expect(tenantScope('')).toEqual([])
    expect(tenantScope(undefined)).toEqual([])
  })

  it('an item that is not the shape of the point is refused by the registry, with its reason', async () => {
    const w = await world()
    await w.root.plugin({
      name: 'odd',
      inject: ['dynamis'],
      apply: (ctx: Context) =>
        void ctx.dynamis.put([
          {
            point: TOKENS_POINT,
            key: 'notes.composer.send',
            id: '',
            scope: alice,
            rank: 0,
            digest: 'x',
            item: {},
          },
        ]),
    })
    expect(w.read().refused).toEqual([
      {
        point: TOKENS_POINT,
        key: 'notes.composer.send',
        by: 'odd',
        scope: alice,
        reason: 'the item lacks tokens (object)',
      },
    ])
  })

  it('the shell reads the changes for the tenant it shows, with the tokens it knows', async () => {
    class Knowing extends Framed {
      protected override knowsToken(name: string): boolean {
        return known(name)
      }
    }
    const { root, shell } = await startShellOf(Knowing)
    await place(
      root,
      'brand',
      ctx => void ctx.shell.putTokens('shell.app', { '--omne-accent': '#0a7' }, alice),
    )
    expect(shell.changes().css).toBe(LAYER(''))
    shell.tenant = ALICE
    expect(shell.changes().css).toBe(LAYER(':root{--omne-accent:#0a7;}'))
  })

  it('a shell that knows no token refuses every token', async () => {
    const { root, shell } = await startShellOf(Framed)
    await place(
      root,
      'brand',
      ctx => void ctx.shell.putTokens('shell.app', { '--omne-accent': '#0a7' }),
    )
    expect(shell.changes().refused.map(item => item.reason)).toEqual([
      '--omne-accent is not a token of the interface',
    ])
  })
})
