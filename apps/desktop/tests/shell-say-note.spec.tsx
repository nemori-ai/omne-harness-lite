// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Fiber, Plugin } from '@deepseek-ai/cordis'
import { useRef } from 'react'
import type { FloatProps } from '@omne-harness/shell-contract'
import type { FaceFlip, FlipState } from '@omne-harness/ui-kit'
import type { Face } from '../src/page/shell/state.ts'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { createShellNote, type ShellNote } from '../src/page/shell/say-note.ts'
import { useNoteView, useShutOnTurn, WindowNote } from '../src/page/shell/say-note-view.tsx'
import { fakeGate, placeholder } from './support/fake-modules.tsx'
import { sayItem, sayPlace } from './support/desk-stay.ts'
import { setup, settle } from './support/shell-setup.tsx'

const seen: { id: string; props: FloatProps }[] = []

beforeEach(() => {
  seen.length = 0
  generation = 0
  Object.assign(Element.prototype, {
    animate: () => ({ cancel: () => undefined, finished: Promise.resolve() }),
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** Bumped by a case to have the floating item draw its button as a new element. */
let generation = 0

/** A floating item whose button opens the note beside itself, or beside `body` when told to; the button is also what it is dragged by. */
function pet(id = 'pet', beside: 'button' | 'body' = 'button'): Plugin.Object {
  return defineUiModule({
    name: `pet-${id}`,
    needs: {},
    apply(shell) {
      shell.contribute('float', {
        id,
        order: 0,
        render: props => {
          seen.push({ id, props })
          return (
            <button
              key={generation}
              type="button"
              data-opener={id}
              {...props.grip}
              onClick={event =>
                props.note.toggle(beside === 'body' ? document.body : event.currentTarget)
              }
            >
              随身
            </button>
          )
        },
      })
    },
  })
}

function talker(item = sayItem('session-ui#1')): Plugin.Object {
  return defineUiModule({
    name: 'talker',
    needs: {},
    apply(shell) {
      shell.contribute('say', item.item)
    },
  })
}

function backSide(): Plugin.Object {
  return defineUiModule({
    name: 'fake-back',
    needs: {},
    apply(shell) {
      shell.contribute('back', { id: 'canvas', render: () => placeholder('反面占位') })
    },
  })
}

const opener = (id = 'pet') => document.querySelector<HTMLElement>(`[data-opener="${id}"]`)!
const bubble = () => document.querySelector<HTMLElement>('.omne-say-bubble')
const field = () => document.querySelector<HTMLTextAreaElement>('.omne-say-field')!
const last = (id = 'pet') => seen.findLast(each => each.id === id)?.props
const open = (id = 'pet') => last(id)?.note.open
/** The note is closing or gone: a closing bubble stays a moment, inert. */
const shut = () => bubble() === null || bubble()!.hasAttribute('inert')
const toggle = (id = 'pet') => act(() => void fireEvent.click(opener(id)))
const type = (text: string) =>
  act(() => void fireEvent.change(field(), { target: { value: text } }))
const plug = async (t: Awaited<ReturnType<typeof setup>>, module: Plugin.Object) => {
  let fiber: Fiber | undefined
  await act(async () => {
    fiber = t.root.plugin(module)
    await fiber
    await settle()
  })
  return async () =>
    act(async () => {
      await fiber?.dispose()
      await settle()
    })
}

/** Signed in as tenant-a with the floating item and an item in the say slot; the note written half a sentence and open. */
async function written(more: readonly Plugin.Object[] = [], given = sayItem('session-ui#1')) {
  const t = await setup({
    login: 'signed-in',
    modules: [fakeGate(), pet(), talker(given), ...more],
  })
  act(() => t.state.scope.set('tenant-a'))
  toggle()
  type('半句话')
  return t
}

/** Opens the note again from the floating item: the half sentence is still in it. */
function stillThere(): void {
  if (open() !== true) toggle()
  expect(open()).toBe(true)
  expect(field().value).toBe('半句话')
}

describe('窗口里的笺：经笺口开与收', () => {
  it('给的元素不在这一项自己画的东西里面：开不出', async () => {
    await setup({ login: 'signed-in', modules: [fakeGate(), pet('pet', 'body'), talker()] })
    toggle()
    expect(open()).toBe(false)
    expect(bubble()).toBeNull()
  })

  it('开着时开它的元素被换掉：按在这一项里的新元素上不先收，接着的单击把笺收起', async () => {
    await written()
    const was = opener()
    generation += 1
    type('半句话。')
    expect(opener()).not.toBe(was)
    expect(was.isConnected).toBe(false)
    act(() => void fireEvent.pointerDown(opener()))
    expect(open()).toBe(true)
    toggle()
    expect(open()).toBe(false)
  })

  it('浮层项经笺口开：外壳用 SayBubble 画在浮层那一层里、各项之后，带部位 shell.figure.note；浮层项收到 open 为真', async () => {
    await written()
    expect(open()).toBe(true)
    expect(last()?.note.there).toBe(true)
    expect(bubble()?.getAttribute('data-omne-part')).toBe('shell.figure.note')
    expect(bubble()?.parentElement?.classList.contains('shell-float')).toBe(true)
    expect(bubble()?.previousElementSibling?.classList.contains('shell-float-item')).toBe(true)
  })

  it('说话位上没有一项：浮层项收到 there 为假，toggle 开不出', async () => {
    await setup({ login: 'signed-in', modules: [fakeGate(), pet()] })
    expect(last()?.note.there).toBe(false)
    toggle()
    expect(open()).toBe(false)
    expect(bubble()).toBeNull()
  })

  it('再按一次开它的元素：收起', async () => {
    await written()
    toggle()
    expect(open()).toBe(false)
    stillThere()
  })

  it('笺口只有四样，不交出字、图与说给谁', async () => {
    await written()
    expect(Object.keys(last()!.note).toSorted()).toEqual(['close', 'open', 'there', 'toggle'])
  })

  it('发送：说给缺省的那一个，带字段里的整段字，用当前租户', async () => {
    const item = sayItem('session-ui#1')
    await written([], item)
    act(() => void fireEvent.keyDown(field(), { key: 'Enter' }))
    expect(item.said).toEqual([['tenant-a', { kind: 'new' }, '半句话']])
  })
})

describe('窗口里的笺：什么时候收，收了字还在', () => {
  it('人按收起：收起，焦点回到开它的元素', async () => {
    await written()
    act(() => void fireEvent.click(screen.getByRole('button', { name: '收起' })))
    expect(open()).toBe(false)
    expect(document.activeElement).toBe(opener())
    stillThere()
  })

  it('Escape：收起，焦点回到开它的元素', async () => {
    await written()
    act(() => void fireEvent.keyDown(field(), { key: 'Escape' }))
    expect(open()).toBe(false)
    expect(document.activeElement).toBe(opener())
    stillThere()
  })

  it('在笺与开它的元素之外按下：收起', async () => {
    await written()
    act(() => void fireEvent.pointerDown(document.body))
    expect(open()).toBe(false)
    stillThere()
  })

  it('按在笺里、开它的元素上、「说给谁」的弹层上：不算之外', async () => {
    await written()
    act(() => void fireEvent.pointerDown(field()))
    expect(open()).toBe(true)
    const popup = document.createElement('div')
    popup.setAttribute('data-slot', 'select-content')
    const option = popup.appendChild(document.createElement('span'))
    document.body.append(popup)
    act(() => void fireEvent.pointerDown(option))
    expect(open()).toBe(true)
    act(() => void fireEvent.pointerDown(opener()))
    expect(open()).toBe(true)
    popup.remove()
  })

  it('按着开它的元素时笺自己失焦收起不算：接着的一下单击把它收起，不再开出来', async () => {
    await written()
    type('')
    act(() => {
      fireEvent.pointerDown(opener())
      fireEvent.blur(field(), { relatedTarget: opener() })
    })
    expect(open()).toBe(true)
    toggle()
    expect(open()).toBe(false)
  })

  it('在开它的元素上按下又抬起而没有单击（按下后移开再抬起）：之后按 Escape 照常收起', async () => {
    await written()
    act(() => {
      fireEvent.pointerDown(opener())
      fireEvent.pointerUp(document.body)
    })
    act(() => void fireEvent.keyDown(field(), { key: 'Escape' }))
    expect(open()).toBe(false)
    stillThere()
  })

  it('翻面：收起', async () => {
    const t = await written([backSide()])
    act(() => t.state.face.turn())
    expect(open()).toBe(false)
    act(() => t.state.face.turn())
    stillThere()
  })

  it('开它的浮层项被拖起来：收起', async () => {
    await written()
    const at = (x: number, y: number, buttons = 1) => ({
      pointerId: 1,
      isPrimary: true,
      button: 0,
      buttons,
      clientX: x,
      clientY: y,
    })
    act(() => void fireEvent.pointerDown(opener(), at(10, 10)))
    act(() => void fireEvent.pointerMove(opener(), at(40, 40)))
    expect(last()?.dragging).toBe(true)
    expect(open()).toBe(false)
    act(() => void fireEvent.pointerUp(opener(), at(40, 40, 0)))
    act(() => void fireEvent.pointerDown(opener(), at(40, 40)))
    act(() => void fireEvent.pointerUp(opener(), at(40, 40, 0)))
    stillThere()
  })

  it('开它的浮层项撤下：收起；它回来再开，字还在', async () => {
    const t = await written([], sayItem('session-ui#1'))
    const other = await plug(t, pet('other'))
    act(() => void fireEvent.click(opener('other')))
    expect(open('other')).toBe(true)
    expect(shut()).toBe(false)
    await other()
    expect(shut()).toBe(true)
    toggle()
    expect(open()).toBe(true)
    expect(field().value).toBe('半句话')
  })

  it('说话位上的那一项撤下：收起，浮层项收到 there 为假；它回来再开，字还在', async () => {
    const t = await setup({ login: 'signed-in', modules: [fakeGate(), pet()] })
    act(() => t.state.scope.set('tenant-a'))
    const away = await plug(t, talker())
    toggle()
    type('半句话')
    await away()
    expect(last()?.note).toMatchObject({ there: false, open: false })
    await plug(t, talker())
    stillThere()
  })

  it('租户换了：收起，整份丢掉，再开字段是空的', async () => {
    const t = await written()
    act(() => t.state.scope.set('tenant-b'))
    expect(open()).toBe(false)
    toggle()
    expect(field().value).toBe('')
  })

  it('另一个浮层项开：开到它身边，原来那一项收到 open 为假', async () => {
    const t = await written()
    await plug(t, pet('other'))
    act(() => void fireEvent.click(opener('other')))
    expect(open('other')).toBe(true)
    expect(open()).toBe(false)
    expect(field().value).toBe('半句话')
  })
})

/** The window's note over a note the case holds, the way the floating layer draws it. */
function Layer(props: { readonly note: ShellNote; readonly settings?: () => void }) {
  const { note, settings = () => undefined } = props
  const view = useNoteView(note)
  const layer = useRef<HTMLDivElement>(null)
  return (
    <div ref={layer} className="shell-float">
      {view !== null && <WindowNote note={note} view={view} layer={layer} settings={settings} />}
    </div>
  )
}

/** The window's note open over an item the case holds, drawn by the floating layer. */
function drawnOver(given: Parameters<typeof sayItem>[1] = {}, settings?: () => void) {
  const place = sayPlace()
  const one = sayItem('session-ui#1', given)
  place.put(one.item)
  const note = createShellNote({ slots: place.slots, scope: () => 'tenant-a' })
  const button = document.body.appendChild(document.createElement('button'))
  act(() => note.toggle('pet', button))
  render(<Layer note={note} {...(settings === undefined ? {} : { settings })} />)
  return { note, one }
}

describe('窗口里的笺：按钮各自做什么', () => {
  it('没有许可的说明里按打开系统设置：调外壳给的设置入口', () => {
    const settings = vi.fn()
    const t = drawnOver({}, settings)
    act(() => t.note.give({ pictures: [], told: { kind: 'not-authorized' }, send: false }))
    act(() => void fireEvent.click(screen.getByRole('button', { name: '打开系统设置' })))
    expect(settings).toHaveBeenCalledTimes(1)
  })

  it('受理之后按去对话页：调 show，窗口里的笺收起', async () => {
    const t = drawnOver({ say: () => Promise.resolve({ kind: 'sent', key: 's-9' }) })
    act(() => void fireEvent.change(field(), { target: { value: '在吗' } }))
    act(() => void fireEvent.keyDown(field(), { key: 'Enter' }))
    await act(settle)
    act(() => void fireEvent.click(screen.getByRole('button', { name: '去对话页' })))
    expect(t.one.shown).toEqual([['tenant-a', 's-9']])
    expect(t.note.view().window).toBeNull()
  })

  it('正在发时打字不改字', () => {
    const t = drawnOver({ say: () => new Promise(() => undefined) })
    act(() => void fireEvent.change(field(), { target: { value: '在吗' } }))
    act(() => void fireEvent.keyDown(field(), { key: 'Enter' }))
    act(() => void fireEvent.change(field(), { target: { value: '在吗？？' } }))
    expect(t.note.view().note.words).toBe('在吗')
  })
})

describe('窗口里的笺：状态里有图', () => {
  const ONE = { name: '窗口 09.05.07.png', bytes: new Uint8Array([1]) }
  const TWO = { name: '近看 09.05.07.png', bytes: new Uint8Array([2]) }

  function pictured() {
    let made = 0
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:picture-${(made += 1)}`)
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const place = sayPlace()
    const one = sayItem('session-ui#1', { pictures: () => true })
    place.put(one.item)
    const note = createShellNote({ slots: place.slots, scope: () => 'tenant-a' })
    const button = document.body.appendChild(document.createElement('button'))
    act(() => note.toggle('pet', button))
    act(() => note.give({ pictures: [ONE, TWO], send: false }))
    render(<Layer note={note} />)
    const thumbs = () =>
      [...document.querySelectorAll<HTMLImageElement>('.omne-say-thumb')].map(img => img.alt)
    return { note, one, thumbs }
  }

  it('照样显示', () => {
    const t = pictured()
    expect(t.thumbs()).toEqual([ONE.name, TWO.name])
  })

  it('照样能去掉一张', () => {
    const t = pictured()
    act(() => void fireEvent.click(screen.getByRole('button', { name: `去掉${ONE.name}` })))
    expect(t.note.view().pictures.map(picture => picture.name)).toEqual([TWO.name])
    expect(t.thumbs()).toEqual([TWO.name])
  })

  it('发送时交给 say', () => {
    const t = pictured()
    act(() => void fireEvent.change(field(), { target: { value: '看一下' } }))
    act(() => void fireEvent.keyDown(field(), { key: 'Enter' }))
    expect(t.one.said).toEqual([['tenant-a', { kind: 'new' }, '看一下', [ONE, TWO]]])
  })
})

/** A flip the case moves by hand: its phase leaves rest without the face changing. */
function handFlip() {
  let state: FlipState = { phase: 'idle', cut: false }
  const listeners = new Set<() => void>()
  const flip: Pick<FaceFlip, 'subscribe' | 'current'> = {
    current: () => state,
    subscribe: listener => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
  const move = (next: FlipState) => {
    state = next
    for (const listener of listeners) listener()
  }
  return { flip, move }
}

function Turning(props: {
  readonly note: ShellNote
  readonly flip: Pick<FaceFlip, 'subscribe' | 'current'>
  readonly face: Face
}) {
  useShutOnTurn(props.note, props.flip, props.face)
  return null
}

describe('窗口里的笺：翻面开始就收', () => {
  function opened() {
    const place = sayPlace()
    place.put(sayItem('session-ui#1').item)
    const note = createShellNote({ slots: place.slots, scope: () => 'tenant-a' })
    note.toggle('pet', document.body.appendChild(document.createElement('button')))
    return note
  }
  const PLAN = {
    toward: 'right',
    take: { x: 0, y: 0 },
    give: { x: 0, y: 0 },
    approach: 100,
    carry: 100,
    settle: 100,
  } as const

  it('翻面的 phase 离开 idle 而 face 还没换：笺已经收起', () => {
    const note = opened()
    const { flip, move } = handFlip()
    render(<Turning note={note} flip={flip} face="front" />)
    expect(note.view().window).not.toBeNull()
    act(() => move({ phase: 'approach', plan: PLAN, began: 0, carried: null }))
    expect(note.view().window).toBeNull()
  })

  it('减弱动效时没有 phase：face 一换就收起', () => {
    const note = opened()
    const { flip } = handFlip()
    const view = render(<Turning note={note} flip={flip} face="front" />)
    expect(note.view().window).not.toBeNull()
    view.rerender(<Turning note={note} flip={flip} face="back" />)
    expect(note.view().window).toBeNull()
  })
})
