import { Context, type Fiber } from '@deepseek-ai/cordis'
import { render, tree } from '@omne-harness/dynamis'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { describe, expect, it } from 'vitest'
import {
  PARTS_POINT,
  ShellAssemblyError,
  definePart,
  partFault,
  partsOn,
  type PartDeclaration,
} from '@omne-harness/shell-contract'
import { ReferenceShell, startShellOf } from '@omne-harness/shell-contract/testing'
import { startShell } from './reference-shell.ts'

const composer: PartDeclaration = {
  name: 'notes.composer',
  label: '输入框',
  summary: '写一条笔记的地方',
  depths: ['tokens', 'style'],
}
const send: PartDeclaration = {
  name: 'notes.composer.send',
  label: '发送按钮',
  summary: '把写好的一条发出去',
  within: 'notes.composer',
  depths: ['tokens', 'style', 'render'],
}

function place(root: Context, name: string, put: (ctx: Context) => void): Fiber {
  return root.plugin({ name, inject: ['shell'], apply: put })
}

function failure(root: Context, name: string, put: (ctx: Context) => void): Promise<unknown> {
  return new Promise(resolve => {
    root.plugin({
      name,
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

describe('the declaration of a part, checked against the module that makes it', () => {
  const named = (name: string): PartDeclaration => ({ ...composer, name })

  it('takes two, three and four segments under the host of the module', () => {
    expect(partFault(named('notes.composer'), 'notes')).toBeNull()
    expect(partFault(named('notes.composer.send'), 'notes')).toBeNull()
    expect(partFault(named('notes.side-list.row.badge-2'), 'notes')).toBeNull()
  })

  it('refuses a name of one segment and a name of five', () => {
    expect(partFault(named('notes'), 'notes')).toBe(
      'the name has 1 segment, a part has two to four',
    )
    expect(partFault(named('notes.a.b.c.d'), 'notes')).toBe(
      'the name has 5 segments, a part has two to four',
    )
  })

  it('refuses a segment that is not lower case letters, digits and hyphens after a letter', () => {
    const shape = 'is not lower case letters, digits and hyphens after a letter'
    expect(partFault(named('notes.Composer'), 'notes')).toBe(`the segment Composer ${shape}`)
    expect(partFault(named('notes.2nd'), 'notes')).toBe(`the segment 2nd ${shape}`)
    expect(partFault(named('notes..send'), 'notes')).toBe(`the segment  ${shape}`)
    expect(partFault(named('notes.send_now'), 'notes')).toBe(`the segment send_now ${shape}`)
  })

  it('refuses a name under the host of another module', () => {
    expect(partFault(named('tasks.composer'), 'notes')).toBe(
      'the name is under tasks, this module declares under notes',
    )
  })

  it('refuses what it is inside when that is not the name of a part, and a part inside itself', () => {
    expect(partFault({ ...send, within: 'Notes' }, 'notes')).toBe(
      'within: the name has 1 segment, a part has two to four',
    )
    expect(partFault({ ...send, within: send.name }, 'notes')).toBe('the part is inside itself')
    expect(partFault({ ...send, within: 'tasks.board' }, 'notes')).toBeNull()
    expect(partFault({ ...send, within: null }, 'notes')).toBeNull()
  })

  it('refuses a depth it does not know and a depth named twice', () => {
    expect(partFault({ ...composer, depths: ['tokens', 'layout' as never] }, 'notes')).toBe(
      'the depth layout is not one of tokens, style, render',
    )
    expect(partFault({ ...composer, depths: ['style', 'style'] }, 'notes')).toBe(
      'the depth style is named twice',
    )
    expect(partFault({ ...composer, depths: [] }, 'notes')).toBeNull()
  })

  it('takes a note of the one state a part is drawn in, and refuses an empty one', () => {
    expect(partFault({ ...composer, when: '一轮在跑时' }, 'notes')).toBeNull()
    expect(partFault({ ...composer, when: ' ' }, 'notes')).toBe(
      'the note of when it is drawn is empty',
    )
  })

  it('refuses a part with no label or no summary', () => {
    expect(partFault({ ...composer, label: ' ' }, 'notes')).toBe('the label is empty')
    expect(partFault({ ...composer, summary: '' }, 'notes')).toBe('the summary is empty')
    expect(partFault({ ...composer, summary: '  ' }, 'notes')).toBe('the summary is empty')
  })
})

describe('a part a view module declares', () => {
  it('carries its name to the element it is drawn on', () => {
    expect(definePart(send).props).toEqual({ 'data-part': 'notes.composer.send' })
    expect(definePart(send).name).toBe('notes.composer.send')
  })

  it('is on the point of the parts under its name, with what it is called, what it is, what it is inside and its depths', async () => {
    const { root, shell } = await startShell()
    await place(root, 'notes-ui', ctx => {
      definePart(composer).declare(ctx.shell)
      definePart(send).declare(ctx.shell)
    })
    expect(partsOn(shell.registry())).toEqual({
      kind: 'read',
      parts: [
        { ...composer, within: null, when: null, by: ['notes-ui'] },
        { ...send, when: null, by: ['notes-ui'] },
      ],
      conflicts: [],
    })
    const drawn = render(tree(shell.registry(), []).root)
    expect(drawn).toContain(`${PARTS_POINT}  [keyed-one]`)
    expect(drawn).toContain('notes.composer.send')
  })

  it('lists the parts and the conflicts by name, whatever order they were declared in', async () => {
    const { root, shell } = await startShell()
    const area = (name: string, label = '一块'): PartDeclaration => ({ ...composer, name, label })
    await place(root, 'notes-ui', ctx => {
      for (const name of ['notes.side', 'notes.composer', 'notes.z', 'notes.board', 'notes.a'])
        definePart(area(name)).declare(ctx.shell)
    })
    await place(root, 'notes-ui', ctx => {
      definePart(area('notes.z', '另一块')).declare(ctx.shell)
      definePart(area('notes.a', '另一块')).declare(ctx.shell)
    })
    const read = partsOn(shell.registry())
    expect(read.kind === 'read' && read.parts.map(part => part.name)).toEqual([
      'notes.board',
      'notes.composer',
      'notes.side',
    ])
    expect(read.kind === 'read' && read.conflicts.map(conflict => conflict.name)).toEqual([
      'notes.a',
      'notes.z',
    ])
  })

  it('the host of a module is its name without the -ui it ends with, and no other -ui in it', async () => {
    const { root, shell } = await startShell()
    await place(root, 'notes-ui-extras-ui', ctx =>
      definePart({ ...composer, name: 'notes-ui-extras.board' }).declare(ctx.shell),
    )
    const read = partsOn(shell.registry())
    expect(read.kind === 'read' && read.parts.map(part => part.name)).toEqual([
      'notes-ui-extras.board',
    ])
  })

  it('answers unavailable, not an empty list, on a tree where no shell declared the point', async () => {
    const root = new Context()
    await root.plugin(DynamisService)
    expect(partsOn(root.dynamis.registry())).toMatchObject({
      kind: 'unavailable',
      reason: 'undeclared',
    })
  })

  it('carries the note of the one state it is drawn in, and null when it is always there', async () => {
    const { root, shell } = await startShell()
    await place(root, 'notes-ui', ctx => {
      definePart(composer).declare(ctx.shell)
      definePart({ ...send, when: '写了字之后' }).declare(ctx.shell)
    })
    const read = partsOn(shell.registry())
    expect(read.kind === 'read' && read.parts.map(part => part.when)).toEqual([null, '写了字之后'])
  })

  it('the shell declares its own parts under shell, and a view module cannot', async () => {
    const frame: PartDeclaration = {
      name: 'shell.app',
      label: '整个应用',
      summary: '窗口里的一切',
      depths: ['tokens'],
    }
    class Framed extends ReferenceShell {
      constructor(ctx: Context) {
        super(ctx)
        this.declareOwn([frame])
      }
    }
    const { root, shell } = await startShellOf(Framed)
    const read = partsOn(shell.registry())
    expect(read.kind === 'read' && read.parts).toEqual([
      { ...frame, within: null, when: null, by: ['Framed'] },
    ])
    const error = await failure(root, 'shell-extras-ui', ctx =>
      definePart({ ...frame, name: 'shell.sidebar' }).declare(ctx.shell),
    )
    expect((error as Error).message).toContain(
      'the name is under shell, this module declares under shell-extras',
    )
  })

  it('a shell that declares a part of its own outside shell does not start', async () => {
    class Stray extends ReferenceShell {
      constructor(ctx: Context) {
        super(ctx)
        this.declareOwn([{ ...composer }])
      }
    }
    await expect(startShellOf(Stray)).rejects.toThrow(
      'the name is under notes, this module declares under shell',
    )
  })

  it('goes from the point when the module that declared it unloads', async () => {
    const { root, shell } = await startShell()
    const fiber = place(root, 'notes-ui', ctx => definePart(composer).declare(ctx.shell))
    await fiber
    await fiber.dispose()
    await settle()
    expect(partsOn(shell.registry())).toEqual({ kind: 'read', parts: [], conflicts: [] })
  })

  it('throws in the module that declares a name the rule refuses, and nothing of it is on the point', async () => {
    const { root, shell } = await startShell()
    const error = await failure(root, 'notes-ui', ctx => {
      definePart(composer).declare(ctx.shell)
      definePart({ ...send, name: 'tasks.send' }).declare(ctx.shell)
    })
    expect(error).toBeInstanceOf(ShellAssemblyError)
    expect(error).toMatchObject({ id: 'tasks.send', reason: 'invalid' })
    expect((error as Error).message).toContain(
      'the name is under tasks, this module declares under notes',
    )
    await settle()
    expect(partsOn(shell.registry())).toEqual({ kind: 'read', parts: [], conflicts: [] })
  })

  it('a second module of the same host that declares the same part the same way is the same part', async () => {
    const { root, shell } = await startShell()
    await place(root, 'notes-ui', ctx => definePart(composer).declare(ctx.shell))
    await place(root, 'notes-ui', ctx => definePart(composer).declare(ctx.shell))
    const read = partsOn(shell.registry())
    expect(read.kind === 'read' && read.parts.map(part => part.name)).toEqual(['notes.composer'])
    expect(read.kind === 'read' && read.conflicts).toEqual([])
  })

  it('two declarations of one name that differ are a conflict: the name stands for no part, both modules are named', async () => {
    const { root, shell } = await startShell()
    await place(root, 'notes-ui', ctx => definePart(composer).declare(ctx.shell))
    const second = await place(root, 'notes-ui', ctx =>
      definePart({ ...composer, label: '写字的地方' }).declare(ctx.shell),
    )
    expect(partsOn(shell.registry())).toEqual({
      kind: 'read',
      parts: [],
      conflicts: [{ name: 'notes.composer', by: ['notes-ui', 'notes-ui~2'] }],
    })
    await second.dispose()
    await settle()
    const read = partsOn(shell.registry())
    expect(read.kind === 'read' && read.parts.map(part => part.label)).toEqual(['输入框'])
  })
})
