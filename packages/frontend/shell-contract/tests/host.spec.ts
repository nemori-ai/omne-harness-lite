import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  RENDER_POINT,
  STYLE_POINT,
  TOKENS_POINT,
  definePart,
  definePoint,
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

describe('whether a point takes a drawing', () => {
  it('is so for the drawings of parts and for a point that picks a drawing by key, once it is declared', async () => {
    const t = await world()
    const card = defineRenderPoint({ name: 'notes.card', key: 'the kind', summary: 'A note.' })
    expect(t.shell.takesDrawing(RENDER_POINT)).toBe(true)
    expect(t.shell.takesDrawing('notes.card')).toBe(false)
    card.declare(t.shell)
    expect(t.shell.takesDrawing('notes.card')).toBe(true)
  })

  it('is not so for a point that takes data, a point that holds a list, or a name nobody declared', async () => {
    const t = await world()
    const text = { encode: (value: string) => value, decode: (value: string) => value }
    definePoint({ name: 'notes.side', subject: text }).declare(t.shell)
    expect(t.shell.takesDrawing(TOKENS_POINT)).toBe(false)
    expect(t.shell.takesDrawing(STYLE_POINT)).toBe(false)
    expect(t.shell.takesDrawing('notes.side')).toBe(false)
    expect(t.shell.takesDrawing('shell.pages')).toBe(false)
    expect(t.shell.takesDrawing('notes.nowhere')).toBe(false)
  })
})
