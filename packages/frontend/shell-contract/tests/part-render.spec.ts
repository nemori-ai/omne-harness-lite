import { Context, type Fiber } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  RENDER_POINT,
  ShellAssemblyError,
  definePart,
  tenantScope,
  type PartDeclaration,
  type PartRender,
} from '@omne-harness/shell-contract'
import { ReferenceShell, startShellOf } from '@omne-harness/shell-contract/testing'

type Message = Readonly<{ words: string }>

const app: PartDeclaration = {
  name: 'shell.app',
  label: '整个应用',
  summary: '窗口里的一切',
  depths: ['tokens', 'style'],
}
const message = definePart<Message>({
  name: 'notes.message',
  label: '一条笔记',
  summary: '写下的一条',
  depths: ['tokens', 'style', 'render'],
})
const title = definePart<Message>({
  name: 'notes.title',
  label: '标题',
  summary: '这一页的名字',
  depths: ['style'],
})

const ALICE = '{"organization":"org_1","account":"acc_alice"}'
const BOB = '{"organization":"org_1","account":"acc_bob"}'
const alice = tenantScope(ALICE)

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
  started.shell.tenant = ALICE
  await place(started.root, 'notes-ui', ctx => {
    message.declare(ctx.shell)
    title.declare(ctx.shell)
  })
  const draw = (words = '你好') => message.draw(started.shell, () => `built-in:${words}`, { words })
  return { ...started, draw }
}

const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 5))
const shout: PartRender<Message> = ({ props }) => `shout:${props.words.toUpperCase()}`

describe('the drawing of a part', () => {
  it('is what the module that declares it draws, while nobody put another', async () => {
    const w = await world()
    expect(w.draw()).toBe('built-in:你好')
  })

  it('is the one put on it: it is given what the host gives, the name of the part and the drawing it stands in for', async () => {
    const w = await world()
    const seen: unknown[] = []
    await place(
      w.root,
      'brand',
      ctx =>
        void ctx.shell.putRender<Message>(
          'notes.message',
          given => {
            seen.push(given.props, given.part)
            return `mine around (${String(given.builtIn())})`
          },
          alice,
        ),
    )
    expect(w.draw('abc')).toBe('mine around (built-in:abc)')
    expect(seen).toEqual([{ words: 'abc' }, { 'data-omne-part': 'notes.message' }])
    expect(w.shell.changes().standing.filter(item => item.point === RENDER_POINT)).toEqual([
      { point: RENDER_POINT, key: 'notes.message', by: ['brand'], scope: alice, builtIn: false },
    ])
  })

  it('a drawing put on a part is not an item of an attached place', async () => {
    const w = await world()
    await place(w.root, 'brand', ctx => void ctx.shell.putRender('notes.message', shout))
    expect(w.shell.items('attached')).toEqual([])
  })

  it('taken back, or with the module that put it unloaded, the part is drawn as it shipped', async () => {
    const w = await world()
    let take: (() => unknown) | undefined
    const fiber = place(w.root, 'brand', ctx => {
      take = ctx.shell.putRender('notes.message', shout, alice)
    })
    await fiber
    expect(w.draw('abc')).toBe('shout:ABC')
    await take?.()
    await settle()
    expect(w.draw('abc')).toBe('built-in:abc')
    const again = await place(
      w.root,
      'again',
      ctx => void ctx.shell.putRender('notes.message', shout, alice),
    )
    expect(w.draw('abc')).toBe('shout:ABC')
    await again.dispose()
    await settle()
    expect(w.draw('abc')).toBe('built-in:abc')
  })

  it('a drawing that throws falls back to what shipped, for this part only', async () => {
    const w = await world()
    await place(
      w.root,
      'brand',
      ctx =>
        void ctx.shell.putRender<Message>(
          'notes.message',
          ({ props }) => {
            if (props.words === 'bad') throw new Error('no')
            return `mine:${props.words}`
          },
          alice,
        ),
    )
    expect(w.draw('bad')).toBe('built-in:bad')
    expect(w.draw('good')).toBe('mine:good')
  })

  it('a part that does not open render keeps its own drawing, and the item says why it does not count', async () => {
    const w = await world()
    await place(w.root, 'brand', ctx => {
      ctx.shell.putRender('notes.title', shout as never, alice)
      ctx.shell.putRender('shell.app', shout as never, alice)
      ctx.shell.putRender('notes.nowhere', shout as never, alice)
    })
    expect(title.draw(w.shell, () => 'built-in', { words: 'x' })).toBe('built-in')
    expect(
      w.shell
        .changes()
        .refused.filter(item => item.point === RENDER_POINT)
        .map(item => [item.key, item.by, item.reason]),
    ).toEqual([
      ['notes.nowhere', 'brand', 'no part is declared as notes.nowhere'],
      ['notes.title', 'brand', 'the part notes.title does not open render'],
      ['shell.app', 'brand', 'the part shell.app does not open render'],
    ])
  })

  it('two drawings at one scope are a conflict: the part is drawn as it shipped and both are named', async () => {
    const w = await world()
    await place(w.root, 'a', ctx => void ctx.shell.putRender('notes.message', shout, alice))
    const second = await place(
      w.root,
      'b',
      ctx => void ctx.shell.putRender('notes.message', shout, alice),
    )
    expect(w.draw('abc')).toBe('built-in:abc')
    expect(w.shell.changes().conflicts).toEqual([
      { point: RENDER_POINT, key: 'notes.message', by: ['a', 'b'] },
    ])
    await second.dispose()
    await settle()
    expect(w.draw('abc')).toBe('shout:ABC')
  })

  it('what a tenant put is over what holds for the whole deployment, and is not seen by another tenant', async () => {
    const w = await world()
    await place(
      w.root,
      'operator',
      ctx =>
        void ctx.shell.putRender<Message>(
          'notes.message',
          ({ props }) => `everyone:${props.words}`,
        ),
    )
    await place(w.root, 'brand', ctx => void ctx.shell.putRender('notes.message', shout, alice))
    expect(w.draw('abc')).toBe('shout:ABC')
    w.shell.tenant = BOB
    expect(w.draw('abc')).toBe('everyone:abc')
    w.shell.tenant = undefined
    expect(w.draw('abc')).toBe('everyone:abc')
  })

  it('an item whose render is not a function is refused by the registry', async () => {
    const w = await world()
    await place(
      w.root,
      'brand',
      ctx => void ctx.shell.putRender('notes.message', 'words' as never, alice),
    )
    expect(w.draw('abc')).toBe('built-in:abc')
    expect(w.shell.changes().refused.map(item => item.reason)).toEqual([
      'the item lacks render (function)',
    ])
  })

  it('the shell does not open render on a part of its own', async () => {
    class Drawn extends ReferenceShell {
      constructor(ctx: Context) {
        super(ctx)
        this.declareOwn([{ ...app, depths: ['tokens', 'render'] }])
      }
    }
    const failure = await startShellOf(Drawn).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(ShellAssemblyError)
    expect((failure as Error).message).toContain('a part of the shell does not open render')
  })

  it('tells its watchers when the drawings change, and when the tenant on show changes', async () => {
    class Rescoping extends Framed {
      show(tenant: string | undefined): void {
        this.tenant = tenant
        this.rescope()
      }
    }
    const { root, shell } = await startShellOf(Rescoping)
    await place(root, 'notes-ui', ctx => message.declare(ctx.shell))
    let told = 0
    const stop = shell.watchChanges(() => {
      told += 1
    })
    await place(root, 'brand', ctx => void ctx.shell.putRender('notes.message', shout, alice))
    expect(told).toBeGreaterThan(0)
    const before = told
    shell.show(ALICE)
    expect(told).toBe(before + 1)
    expect(message.draw(shell, () => 'built-in', { words: 'abc' })).toBe('shout:ABC')
    stop()
    shell.show(BOB)
    expect(told).toBe(before + 1)
  })
})
