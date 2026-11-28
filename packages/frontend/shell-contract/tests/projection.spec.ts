import { Context, type Fiber } from '@deepseek-ai/cordis'
import type { Scope } from '@omne-harness/dynamis'
import { describe, expect, it } from 'vitest'
import {
  RENDER_POINT,
  changesOn,
  definePart,
  defineRenderPoint,
  lookScope,
  projectionOn,
  tenantScope,
  type DrawingSource,
  type PartDeclaration,
} from '@omne-harness/shell-contract'
import type { ShellService } from '@omne-harness/shell-contract/cordis'
import { ReferenceShell, startShellOf } from '@omne-harness/shell-contract/testing'

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
const title = definePart<Note>({
  name: 'notes.title',
  label: '标题',
  summary: '这一页的名字',
  depths: ['style'],
})
const more = definePart<Note>({
  name: 'notes.more',
  label: '另一条笔记',
  summary: '也画出东西的一处',
  depths: ['render'],
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
const known = (name: string): boolean => name === '--omne-accent'

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
    return known(name)
  }
}

function place(root: Context, name: string, put: (ctx: Context) => void): Fiber {
  return root.plugin({ name, inject: ['shell'], apply: put })
}

const from = (name: string): DrawingSource => ({
  module: `/bridge/plugins/${name}/v1/draw.js`,
  export: 'draw',
  files: `/bridge/plugins/${name}/v1/`,
})

async function world() {
  const started = await startShellOf(Framed)
  started.shell.show(ALICE)
  await place(started.root, 'notes-ui', ctx => {
    message.declare(ctx.shell)
    title.declare(ctx.shell)
    more.declare(ctx.shell)
    calls.declare(ctx.shell)
  })
  return started
}

type Put = (shell: ShellService, scope: Scope, source?: DrawingSource) => unknown

/** The two roads a drawing takes: onto a part, and onto a key of a point that draws by key. */
const roads: readonly (readonly [
  string,
  Readonly<{ put: Put; point: string; key: string; range: object }>,
])[] = [
  [
    'the drawing of a part',
    {
      put: (shell, scope, source) => shell.putRender('notes.message', () => 'mine', scope, source),
      point: RENDER_POINT,
      key: 'notes.message',
      range: { points: [], parts: ['notes.message'] },
    },
  ],
  [
    'a drawing by key',
    {
      put: (shell, scope, source) => calls.put(shell, 'files.write', () => 'mine', scope, source),
      point: 'notes.tool-call',
      key: 'files.write',
      range: { points: ['notes.tool-call'], parts: [] },
    },
  ],
]

const NONE = { drawings: [], unreachable: [] }

describe.each(roads)('the projection of %s', (_road, { put, point, key, range }) => {
  const project = (shell: ShellService) => {
    const { drawings, unreachable } = shell.projection(
      range as Parameters<ShellService['projection']>[0],
    )
    return { drawings, unreachable }
  }

  it('lists nothing on a key nobody put a drawing on', async () => {
    const w = await world()
    expect(project(w.shell)).toEqual(NONE)
  })

  it('lists the drawing that counts with its source, as it was given', async () => {
    const w = await world()
    const odd = { module: 'not even a path', export: 'x' }
    await place(w.root, 'brand', ctx => void put(ctx.shell, alice, odd))
    expect(project(w.shell)).toEqual({ drawings: [{ point, key, source: odd }], unreachable: [] })
  })

  it('lists the drawing that counts without a source as one that does not reach another surface, with who put it', async () => {
    const w = await world()
    await place(w.root, 'brand', ctx => void put(ctx.shell, alice))
    expect(project(w.shell)).toEqual({ drawings: [], unreachable: [{ point, key, by: ['brand'] }] })
  })

  it('lists neither of two drawings at one scope: the key draws what shipped', async () => {
    const w = await world()
    await place(w.root, 'a', ctx => void put(ctx.shell, alice, from('a')))
    await place(w.root, 'b', ctx => void put(ctx.shell, alice, from('b')))
    expect(project(w.shell)).toEqual(NONE)
  })

  it('lists only the one that counts: a deeper scope is over what holds for everyone', async () => {
    const w = await world()
    await place(w.root, 'operator', ctx => void put(ctx.shell, [], from('operator')))
    await place(w.root, 'brand', ctx => void put(ctx.shell, alice))
    expect(project(w.shell)).toEqual({ drawings: [], unreachable: [{ point, key, by: ['brand'] }] })
  })

  it('lists nothing put for a look that is not worn, and what is put for it once it is', async () => {
    const w = await world()
    await place(w.root, 'sea', ctx => void put(ctx.shell, sea, from('sea')))
    expect(project(w.shell)).toEqual(NONE)
    w.shell.wear('sea')
    expect(project(w.shell)).toEqual({
      drawings: [{ point, key, source: from('sea') }],
      unreachable: [],
    })
    w.shell.wear('ink')
    expect(project(w.shell)).toEqual(NONE)
  })

  it('follows the tenant on show: another tenant does not see what one tenant put', async () => {
    const w = await world()
    await place(w.root, 'brand', ctx => void put(ctx.shell, alice, from('brand')))
    expect(project(w.shell).drawings).toHaveLength(1)
    w.shell.show(BOB)
    expect(project(w.shell)).toEqual(NONE)
    w.shell.show(undefined)
    expect(project(w.shell)).toEqual(NONE)
  })

  it('lists an item whose render is not a function as neither', async () => {
    const w = await world()
    await place(w.root, 'brand', ctx => {
      if (point === RENDER_POINT) ctx.shell.putRender(key, 'words' as never, alice, from('brand'))
      else ctx.shell.putDrawing(point, key, 'words' as never, alice, from('brand'))
    })
    expect(project(w.shell)).toEqual(NONE)
  })

  it('lists nothing outside the range it is asked for', async () => {
    const w = await world()
    await place(w.root, 'brand', ctx => void put(ctx.shell, alice))
    expect(w.shell.projection({ points: [], parts: [] })).toMatchObject(NONE)
  })
})

describe('the projection of the drawings of parts', () => {
  it('lists neither a part that does not open render nor a part nobody declared', async () => {
    const w = await world()
    await place(w.root, 'brand', ctx => {
      ctx.shell.putRender('notes.title', () => 'mine', alice, from('brand'))
      ctx.shell.putRender('notes.nowhere', () => 'mine', alice)
    })
    expect(
      w.shell.projection({ points: [], parts: ['notes.title', 'notes.nowhere'] }),
    ).toMatchObject(NONE)
  })

  it('names who put the drawing, not a module that only styles the part', async () => {
    const w = await world()
    await place(w.root, 'brand', ctx => {
      ctx.shell.putRender('notes.message', () => 'mine', alice)
    })
    await place(w.root, 'ink', ctx => {
      ctx.shell.putStyle('notes.message', { base: { color: 'var(--ink)' } }, alice)
    })
    expect(w.shell.projection({ points: [], parts: ['notes.message'] })).toMatchObject({
      unreachable: [{ point: RENDER_POINT, key: 'notes.message', by: ['brand'] }],
    })
  })

  it('names each part the module that draws it, not the one that draws its neighbour', async () => {
    const w = await world()
    await place(w.root, 'brand', ctx => {
      ctx.shell.putRender('notes.message', () => 'mine', alice)
    })
    await place(w.root, 'echo', ctx => {
      ctx.shell.putRender('notes.more', () => 'theirs', alice)
    })
    expect(
      w.shell.projection({ points: [], parts: ['notes.message', 'notes.more'] }),
    ).toMatchObject({
      unreachable: [
        { point: RENDER_POINT, key: 'notes.message', by: ['brand'] },
        { point: RENDER_POINT, key: 'notes.more', by: ['echo'] },
      ],
    })
  })
})

describe('the projection of a point that draws by key', () => {
  it('lists every key that has a drawing on it now, without being told the keys', async () => {
    const w = await world()
    await place(w.root, 'brand', ctx => {
      calls.put(ctx.shell, 'files.write', () => 'write', alice, from('brand'))
      calls.put(ctx.shell, 'files.read', () => 'read', alice)
    })
    expect(w.shell.projection({ points: ['notes.tool-call'], parts: [] })).toMatchObject({
      drawings: [{ point: 'notes.tool-call', key: 'files.write', source: from('brand') }],
      unreachable: [{ point: 'notes.tool-call', key: 'files.read', by: ['brand'] }],
    })
  })

  it('lists the keys in one order, whatever order they were put in', async () => {
    const w = await world()
    await place(w.root, 'brand', ctx => {
      calls.put(ctx.shell, 'files.write', () => 'write', alice, from('brand'))
      calls.put(ctx.shell, 'files.bash', () => 'bash', alice, from('brand'))
    })
    expect(
      w.shell.projection({ points: ['notes.tool-call'], parts: [] }).drawings.map(each => each.key),
    ).toEqual(['files.bash', 'files.write'])
  })

  it('lists nothing on a point nobody declared', async () => {
    const w = await world()
    expect(w.shell.projection({ points: ['notes.nowhere'], parts: [] })).toMatchObject(NONE)
  })
})

describe('the sheet of the projection', () => {
  async function dressed() {
    const w = await world()
    await place(w.root, 'own', ctx => {
      ctx.shell.putTokens('shell.app', { '--omne-accent': 'var(--own)' }, alice)
      ctx.shell.putStyle('notes.message', { base: { color: 'var(--own)' } }, alice)
    })
    await place(w.root, 'sea', ctx => {
      ctx.shell.putTokens('shell.app', { '--omne-accent': 'var(--sea)', '--nope': '1px' }, sea)
      ctx.shell.putStyle('notes.message', { base: { color: 'var(--sea)' } }, sea)
    })
    return w
  }

  it('is the sheet of the changes the shell shows, to the letter, under the tenant and the look it wears', async () => {
    const w = await dressed()
    const range = { points: ['notes.tool-call'], parts: ['notes.message'] }
    expect(w.shell.projection(range).css).toBe(w.shell.changes().css)
    expect(w.shell.projection(range).css).toContain('var(--own)')
    w.shell.wear('sea')
    expect(w.shell.projection(range).css).toBe(w.shell.changes().css)
    expect(w.shell.projection(range).css).toContain('var(--sea)')
    w.shell.show(BOB)
    expect(w.shell.projection(range).css).toBe(w.shell.changes().css)
    expect(w.shell.projection(range).css).not.toContain('var(--')
  })

  it('is, as a pure function, the sheet of changesOn for the same asker', async () => {
    const w = await dressed()
    const registry = w.shell.registry()
    const range = { points: [], parts: [] }
    for (const asker of [[], alice, sea])
      expect(projectionOn(registry, asker, range, known).css).toBe(
        changesOn(registry, asker, known).css,
      )
  })
})
