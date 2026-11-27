import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  LAYOUT_POINT,
  RENDER_POINT,
  STYLE_POINT,
  TOKENS_POINT,
  definePart,
  defineRenderPoint,
  type Hosted,
} from '@omne-harness/shell-contract'
import type { ShellService } from '@omne-harness/shell-contract/cordis'
import { ReferenceShell, startShellOf } from '@omne-harness/shell-contract/testing'

const send = definePart({
  name: 'notes.send',
  label: '发送按钮',
  summary: '把写好的一条发出去',
  depths: ['style'],
})

async function world() {
  const started = await startShellOf(ReferenceShell)
  let inside: ShellService | undefined
  const module = started.root.plugin({
    name: 'notes-ui',
    inject: ['shell'],
    apply(ctx: Context) {
      send.declare(ctx.shell)
      inside = ctx.shell
    },
  })
  await module
  const styles = () =>
    started.shell
      .changes()
      .standing.filter(each => each.point === STYLE_POINT)
      .map(each => `${each.key} by ${each.by.join('+')}`)
  return { ...started, module, shell: inside!, styles }
}

const red = { base: { color: 'red' } }
const blue = { base: { color: 'blue' } }

describe('a scope a module opens under itself', () => {
  it('holds what is put inside under its own name, and takes it away when it is disposed', async () => {
    const t = await world()
    const hosted = await t.shell.host('guest:a', shell => shell.putStyle('notes.send', red))
    expect(hosted.by).toBe('guest:a')
    expect(t.styles()).toEqual(['notes.send by guest:a'])
    await hosted.dispose()
    expect(t.styles()).toEqual([])
  })

  it('is told the name it really took when another scope of that name is still there', async () => {
    const t = await world()
    const first = await t.shell.host('guest:a', shell => shell.putStyle('notes.send', red))
    const second = await t.shell.host('guest:a', shell => shell.putStyle('nowhere', blue))
    expect(second.by).not.toBe(first.by)
    const refused = t.shell.changes().refused.filter(each => each.by === second.by)
    expect(refused.map(each => each.key)).toEqual(['nowhere'])
    expect(t.shell.changes().refused.filter(each => each.by === first.by)).toEqual([])
  })

  it('leaves nothing behind when what runs inside throws, and says why', async () => {
    const t = await world()
    const opened: Promise<Hosted> = t.shell.host('guest:a', shell => {
      shell.putStyle('notes.send', red)
      throw new Error('broken inside')
    })
    await expect(opened).rejects.toThrow('broken inside')
    expect(t.styles()).toEqual([])
  })

  it('leaves with the module that opened it', async () => {
    const t = await world()
    await t.shell.host('guest:a', shell => shell.putStyle('notes.send', red))
    await t.module.dispose()
    expect(t.styles()).toEqual([])
  })
})

describe('what the shell hands the loader of plugins', () => {
  it('gives a form for its three points whose item wraps what a member gives, and none for a drawing', async () => {
    const t = await world()
    for (const point of [TOKENS_POINT, STYLE_POINT, LAYOUT_POINT])
      expect(t.shell.guestForm(point)?.gives).toMatch(/^data: /u)
    expect(t.shell.guestForm(RENDER_POINT)).toBeUndefined()
    expect(t.shell.guestForm('notes.nowhere')).toBeUndefined()
  })

  it('makes the item of a point from the data, with the files of the plugin; refuses data of the wrong shape', async () => {
    const t = await world()
    const tokens = t.shell.guestForm(TOKENS_POINT)
    expect(tokens?.form({ '--omne-accent': 'teal' }, { key: 'shell.app', files: '/p/v/' })).toEqual(
      {
        tokens: { '--omne-accent': 'teal' },
        files: '/p/v/',
      },
    )
    expect(() => tokens?.form(['x'], { key: 'shell.app' })).toThrow(
      'the data is not a record of names and values',
    )
    expect(t.shell.guestForm(LAYOUT_POINT)?.form(['b', 'a'], { key: 'shell.pages' })).toEqual({
      order: ['b', 'a'],
    })
  })
})

describe('what the tree of the interface has now', () => {
  it('is its points and its parts by name, each with what it is; a part that leaves is no longer there', async () => {
    const t = await world()
    const card = defineRenderPoint({ name: 'notes.card', key: 'the kind', summary: 'A note.' })
    card.declare(t.shell)
    const told = t.shell.described()
    expect(told.parts).toEqual([
      {
        name: 'notes.send',
        label: '发送按钮',
        summary: '把写好的一条发出去',
        depths: ['style'],
        within: null,
      },
    ])
    const names = told.points.map(point => point.name)
    expect(names).toEqual([...names].sort())
    expect(names).toEqual(expect.arrayContaining(['notes.card', 'shell.pages', 'shell.part-style']))
    const told_card = told.points.find(point => point.name === 'notes.card')
    expect(told_card).toMatchObject({
      name: 'notes.card',
      summary: 'A note.',
      contract: { name: 'notes.card', tree: 'client', key: 'the kind', binding: 'run' },
    })
    expect(told_card).not.toHaveProperty('dataKeys')
    await t.module.dispose()
    expect(t.shell.described().parts).toEqual([])
  })
})
