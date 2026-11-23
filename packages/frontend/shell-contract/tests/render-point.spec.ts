import { Context, type Fiber } from '@deepseek-ai/cordis'
import { deployment, render as text, tree } from '@omne-harness/dynamis'
import { describe, expect, it } from 'vitest'
import { defineRenderPoint, tenantScope, type KeyRender } from '@omne-harness/shell-contract'
import { ReferenceShell, startShellOf } from '@omne-harness/shell-contract/testing'

type Call = Readonly<{ name: string; state: string }>

const calls = defineRenderPoint<Call>({
  name: 'notes.tool-call',
  key: 'the name of the tool',
  summary: 'How a call of one tool is drawn.',
})

const ALICE = '{"organization":"org_1","account":"acc_alice"}'
const BOB = '{"organization":"org_1","account":"acc_bob"}'
const alice = tenantScope(ALICE)

function place(root: Context, name: string, put: (ctx: Context) => void): Fiber {
  return root.plugin({ name, inject: ['shell'], apply: put })
}

async function world() {
  const started = await startShellOf(ReferenceShell)
  started.shell.tenant = ALICE
  await place(started.root, 'notes-ui', ctx => calls.declare(ctx.shell))
  const draw = (name: string, state = 'done') =>
    calls.draw(started.shell, name, { name, state }, () => `generic:${name}:${state}`)
  return { ...started, draw }
}

const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 5))
const diff: KeyRender<Call> = ({ subject }) => `diff:${subject.state}`

describe('a point that draws by key', () => {
  it('draws the generic drawing of the host on a key nobody put a drawing on', async () => {
    const w = await world()
    expect(w.draw('files.write')).toBe('generic:files.write:done')
  })

  it('draws what is put on the key: it is given the tenant, the subject and the generic drawing', async () => {
    const w = await world()
    const seen: unknown[] = []
    await place(
      w.root,
      'files-ui',
      ctx =>
        void calls.put(ctx.shell, 'files.write', given => {
          seen.push(given.scope, given.subject)
          return `mine around (${String(given.generic())})`
        }),
    )
    expect(w.draw('files.write', 'running')).toBe('mine around (generic:files.write:running)')
    expect(seen).toEqual([ALICE, { name: 'files.write', state: 'running' }])
    expect(w.draw('shell.run')).toBe('generic:shell.run:done')
  })

  it('a drawing that throws falls back to the generic drawing, on this key only', async () => {
    const w = await world()
    await place(w.root, 'files-ui', ctx => {
      calls.put(ctx.shell, 'files.write', () => {
        throw new Error('no')
      })
      calls.put(ctx.shell, 'files.read', diff)
    })
    expect(w.draw('files.write')).toBe('generic:files.write:done')
    expect(w.draw('files.read')).toBe('diff:done')
  })

  it('taken back, or with the module that put it unloaded, the key is drawn by the generic drawing again', async () => {
    const w = await world()
    let take: (() => unknown) | undefined
    await place(w.root, 'files-ui', ctx => {
      take = calls.put(ctx.shell, 'files.write', diff)
    })
    expect(w.draw('files.write')).toBe('diff:done')
    await take?.()
    await settle()
    expect(w.draw('files.write')).toBe('generic:files.write:done')
    const again = await place(
      w.root,
      'again',
      ctx => void calls.put(ctx.shell, 'files.write', diff),
    )
    expect(w.draw('files.write')).toBe('diff:done')
    await again.dispose()
    await settle()
    expect(w.draw('files.write')).toBe('generic:files.write:done')
  })

  it('two drawings on one key at one scope are a conflict: the generic drawing shows and the tree says so', async () => {
    const w = await world()
    await place(w.root, 'a', ctx => void calls.put(ctx.shell, 'files.write', diff))
    const second = await place(w.root, 'b', ctx => void calls.put(ctx.shell, 'files.write', diff))
    expect(w.draw('files.write')).toBe('generic:files.write:done')
    expect(text(tree(w.root.dynamis.registry(), deployment).root)).toMatch(
      /files\.write[\s\S]*conflict/u,
    )
    await second.dispose()
    await settle()
    expect(w.draw('files.write')).toBe('diff:done')
  })

  it('what a tenant put is over what holds for the whole deployment, and is not seen by another tenant', async () => {
    const w = await world()
    await place(w.root, 'files-ui', ctx => void calls.put(ctx.shell, 'files.write', diff))
    await place(
      w.root,
      'brand',
      ctx => void calls.put(ctx.shell, 'files.write', () => 'brand', alice),
    )
    expect(w.draw('files.write')).toBe('brand')
    w.shell.tenant = BOB
    expect(w.draw('files.write')).toBe('diff:done')
  })

  it('what is put there that is not a function does not count', async () => {
    const w = await world()
    await place(
      w.root,
      'files-ui',
      ctx => void calls.put(ctx.shell, 'files.write', 'words' as never),
    )
    expect(w.draw('files.write')).toBe('generic:files.write:done')
  })

  it('the host frames what is put there, and the generic drawing stands alone', async () => {
    const w = await world()
    const framed = (name: string) =>
      calls.draw(
        w.shell,
        name,
        { name, state: 'done' },
        () => 'generic',
        drawn => `[${String(drawn)}]`,
      )
    await place(w.root, 'files-ui', ctx => {
      calls.put(ctx.shell, 'files.read', diff)
      calls.put(ctx.shell, 'files.write', () => {
        throw new Error('no')
      })
    })
    expect(framed('files.read')).toBe('[diff:done]')
    expect(framed('files.write')).toBe('generic')
    expect(framed('shell.run')).toBe('generic')
  })

  it('a point its host did not declare draws the generic drawing', async () => {
    const started = await startShellOf(ReferenceShell)
    await place(started.root, 'files-ui', ctx => void calls.put(ctx.shell, 'files.write', diff))
    expect(
      calls.draw(started.shell, 'files.write', { name: 'x', state: 'y' }, () => 'generic'),
    ).toBe('generic')
  })

  it('what is put on it is not an item of an attached place', async () => {
    const w = await world()
    let told = 0
    w.shell.subscribe('attached', () => {
      told += 1
    })
    await place(w.root, 'files-ui', ctx => void calls.put(ctx.shell, 'files.write', diff))
    expect(w.shell.items('attached')).toEqual([])
    expect(w.shell.conflicts('attached')).toEqual([])
    expect(told).toBe(0)
  })

  it('a point whose keys the server tells reads them from what the connection tells, and says so when it cannot', () => {
    const rows = defineRenderPoint<Call>({
      name: 'notes.entry',
      key: 'the name of the source',
      summary: 'How a row is drawn, by its source.',
      keysFrom: 'notification.sources',
    })
    const told = (keys: readonly string[] | undefined) => ({
      keys: (point: string) => (point === 'notification.sources' ? keys : ['another']),
    })
    expect(rows.keysFrom).toBe('notification.sources')
    expect(rows.keys(told(['calendar.events', 'owner.posts']))).toEqual({
      kind: 'told',
      keys: ['calendar.events', 'owner.posts'],
    })
    expect(rows.keys(told([]))).toEqual({ kind: 'told', keys: [] })
    expect(rows.keys(told(undefined))).toEqual({ kind: 'unavailable' })
    expect(rows.keys(undefined)).toEqual({ kind: 'unavailable' })
  })

  it('a point whose keys no server tells takes any key', () => {
    expect(calls.keysFrom).toBeNull()
    expect(calls.keys({ keys: () => ['a'] })).toEqual({ kind: 'any' })
    expect(calls.keys(undefined)).toEqual({ kind: 'any' })
  })

  it('declares a point of one item to a key, where the most specific stands', () => {
    expect(calls.contract).toMatchObject({
      name: 'notes.tool-call',
      tree: 'client',
      arity: 'keyed-one',
      resolve: 'most-specific',
      key: 'the name of the tool',
      item: { kind: 'pure', fields: { render: 'function' } },
    })
  })
})
