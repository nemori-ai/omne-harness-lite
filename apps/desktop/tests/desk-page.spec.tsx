// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import * as React from 'react'
import { DeskPage, type DeskDeps } from '../src/page/desk/desk.tsx'
import { wearOn } from '../src/page/desk/look.tsx'
import type { Down, LookProjection, Rect, Scene, Up } from '../src/page/desk/scene.ts'
import { createLookHost } from '../src/page/surface/look-host.ts'
import {
  shellFigure,
  shellFigureFrame,
  shellFigureLabel,
  shellFigureNote,
} from '../src/page/shell/parts.ts'

const ORIGIN = { x: 1000, y: 0 }
const ISSUER = 'shell-1'
const WORN: LookProjection = {
  issuer: ISSUER,
  version: 1,
  scope: 'tenant-a',
  css: '',
  drawings: [],
}

type More = Partial<Omit<Scene, 'look'>> & Readonly<{ look?: Partial<Scene['look']> }>

function scene(lease: number, serial: number, where: Scene['where'], more: More = {}): Scene {
  const { look, ...rest } = more
  return {
    lease,
    serial,
    look: { theme: 'light', size: 'medium', reduced: true, issuer: ISSUER, version: 1, ...look },
    figure: { waiting: 0 },
    where,
    label: null,
    note: null,
    frame: null,
    ...rest,
  }
}

let visibility: DocumentVisibilityState = 'visible'

beforeEach(() => {
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
  Object.assign(Element.prototype, {
    animate: () => ({ cancel: () => undefined, finished: Promise.resolve() }),
  })
})
afterEach(() => cleanup())

type DeskOptions = Readonly<{
  worn?: LookProjection | null
  load?: (module: string) => Promise<unknown>
}>

const flushed = () => new Promise(resolve => setTimeout(resolve, 0))

function desk(options: DeskOptions = {}) {
  const posted: Up[] = []
  const hot: (readonly [number, readonly Rect[]])[] = []
  const frames: (() => void)[] = []
  let listener: ((message: Down) => void) | undefined
  const host = createLookHost({
    load: options.load ?? (() => Promise.reject(new Error('nothing to load here'))),
    given: { React, ui: {} },
    later: () => () => undefined,
    wear: { adopt: () => undefined, drop: () => undefined, inked: () => undefined },
    up: asked => void posted.push(asked),
  })
  const worn = options.worn === undefined ? WORN : options.worn
  if (worn !== null) host.take(worn)
  const deps: DeskDeps = {
    look: host,
    post: message => void posted.push(message),
    listen: heard => {
      listener = heard
      return () => {
        listener = undefined
      }
    },
    hot: (lease, rects) => void hot.push([lease, rects]),
    frame: callback => void frames.push(callback),
    origin: () => ORIGIN,
  }
  const view = render(<DeskPage deps={deps} />)
  const main = () => view.container.querySelector<HTMLElement>('main.desk')!
  return {
    posted,
    hot,
    main,
    view,
    send: (message: Down) => act(() => listener?.(message)),
    look: (projection: LookProjection) => act(() => host.take(projection)),
    settle: () => act(flushed),
    frame: () =>
      act(() => {
        for (const callback of frames.splice(0)) callback()
      }),
    handovers: () => posted.filter(message => message.kind !== 'hello'),
  }
}

describe('桌面层的页面', () => {
  it('加载好就报到，不带租约号', () => {
    const page = desk()
    expect(page.posted).toEqual([{ kind: 'hello' }])
  })

  it('只留比手里那一幕新的：租约号更大，或同一个租约里序号更大', () => {
    const page = desk()
    page.send({ kind: 'scene', scene: scene(3, 2, { mode: 'rest', at: { x: 1200, y: 300 } }) })
    page.send({ kind: 'scene', scene: scene(3, 1, { mode: 'none' }) })
    page.send({ kind: 'scene', scene: scene(2, 9, { mode: 'none' }) })
    expect(page.main().dataset['mode']).toBe('rest')
    expect(page.handovers()).toEqual([])
    page.send({ kind: 'scene', scene: scene(4, 1, { mode: 'none' }) })
    expect(page.main().dataset['mode']).toBe('none')
    expect(page.handovers()).toEqual([{ kind: 'cleared', lease: 4, serial: 1 }])
  })

  it('跟手的幕：收到的那一步里不报「画好了」，文档看得见之后的第一帧才报', () => {
    const page = desk()
    page.send({ kind: 'scene', scene: scene(5, 1, { mode: 'hand', at: { x: 1100, y: 200 } }) })
    expect(page.handovers()).toEqual([])
    page.frame()
    expect(page.handovers()).toEqual([{ kind: 'painted', lease: 5, serial: 1 }])
    page.send({ kind: 'scene', scene: scene(5, 2, { mode: 'hand', at: { x: 1100, y: 200 } }) })
    page.frame()
    expect(page.handovers().at(-1)).toEqual({ kind: 'painted', lease: 5, serial: 2 })
  })

  it('文档藏着时跟手的幕不报，成为 visible 之后的第一帧才报', () => {
    visibility = 'hidden'
    const page = desk()
    page.send({ kind: 'scene', scene: scene(5, 1, { mode: 'hand', at: { x: 1100, y: 200 } }) })
    page.frame()
    expect(page.handovers()).toEqual([])
    visibility = 'visible'
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    expect(page.handovers()).toEqual([])
    page.frame()
    expect(page.handovers()).toEqual([{ kind: 'painted', lease: 5, serial: 1 }])
  })

  it('跟手的幕被更新的一幕换掉，就不为它报了', () => {
    const page = desk()
    page.send({ kind: 'scene', scene: scene(5, 1, { mode: 'hand', at: { x: 1100, y: 200 } }) })
    page.send({ kind: 'scene', scene: scene(5, 2, { mode: 'rest', at: { x: 1100, y: 200 } }) })
    page.frame()
    expect(page.handovers()).toEqual([])
  })

  it('回程写到了报「到了」；之后每收下一幕同样的幕都再报', () => {
    const page = desk()
    const home = { mode: 'home', at: { x: 1100, y: 600 } } as const
    page.send({ kind: 'scene', scene: scene(6, 3, home) })
    expect(page.handovers()).toEqual([{ kind: 'arrived', lease: 6, serial: 3 }])
    page.send({ kind: 'scene', scene: scene(6, 4, home, { figure: { waiting: 1 } }) })
    expect(page.handovers().at(-1)).toEqual({ kind: 'arrived', lease: 6, serial: 4 })
    expect(page.handovers()).toHaveLength(2)
  })

  it('空的一幕立刻报「空了」，文档藏着也报', () => {
    visibility = 'hidden'
    const page = desk()
    page.send({ kind: 'scene', scene: scene(7, 1, { mode: 'none' }) })
    expect(page.handovers()).toEqual([{ kind: 'cleared', lease: 7, serial: 1 }])
  })

  it('画东西的幕报 hot：形周围 34px，屏幕上的点；矩形变了才重报；空的幕不报', () => {
    const page = desk()
    const rest = { mode: 'rest', at: { x: 1200, y: 300 } } as const
    page.send({ kind: 'scene', scene: scene(8, 1, rest) })
    expect(page.hot).toEqual([[8, [{ x: 1200 - 62, y: 300 - 62, width: 124, height: 124 }]]])
    page.send({ kind: 'scene', scene: scene(8, 2, rest, { figure: { waiting: 2 } }) })
    expect(page.hot).toHaveLength(1)
    page.send({ kind: 'scene', scene: scene(8, 3, { mode: 'rest', at: { x: 1300, y: 300 } }) })
    expect(page.hot).toHaveLength(2)
    page.send({ kind: 'scene', scene: scene(8, 4, { mode: 'none' }) })
    expect(page.hot).toHaveLength(2)
  })

  it('照一幕写形的状态与待答数、观感', () => {
    const page = desk()
    const look = { theme: 'dark', size: 'large', reduced: true } as const
    const figure = { doing: 'thinking', waiting: 1 } as const
    page.send({ kind: 'scene', scene: scene(9, 1, { mode: 'rest', at: ORIGIN }, { look, figure }) })
    expect(page.main().dataset).toMatchObject({ doing: 'thinking', waiting: '1' })
    expect(document.documentElement.dataset).toMatchObject({ theme: 'dark', size: 'large' })
  })

  it('手的位置只认手里那一幕的租约：别的租约的小消息不挪形', () => {
    const page = desk()
    const label = [{ text: '应用外面' }]
    page.send({
      kind: 'scene',
      scene: scene(9, 1, { mode: 'hand', at: { x: 1100, y: 200 } }, { label }),
    })
    const placed = () =>
      page.view.container.querySelector<HTMLElement>('.omne-figure-label')!.style.cssText
    const before = placed()
    page.send({ kind: 'hand', lease: 8, at: { x: 1400, y: 600 } })
    expect(placed()).toBe(before)
    page.send({ kind: 'hand', lease: 9, at: { x: 1400, y: 600 } })
    expect(placed()).not.toBe(before)
  })

  it('落在形上的拿起、移动与松手报给外壳，点是屏幕上的点：视口里的点加上这块窗口在屏上的原点', () => {
    const page = desk()
    page.send({ kind: 'scene', scene: scene(6, 1, { mode: 'rest', at: { x: 1300, y: 300 } }) })
    const reach = page.view.container.querySelector<HTMLElement>('.omne-figure-reach')!
    const at = (x: number, y: number, buttons: number) => ({
      pointerId: 1,
      button: 0,
      buttons,
      clientX: x,
      clientY: y,
    })
    act(() => void fireEvent.pointerDown(reach, at(300, 300, 1)))
    act(() => void fireEvent.pointerMove(reach, at(340, 320, 1)))
    page.frame()
    act(() => void fireEvent.pointerUp(reach, at(360, 330, 0)))
    const inputs = page.posted.flatMap(message => (message.kind === 'input' ? [message] : []))
    expect(inputs[0]).toEqual({ kind: 'input', lease: 6, input: 'lift', at: { x: 1340, y: 320 } })
    expect(inputs.at(-1)).toEqual({
      kind: 'input',
      lease: 6,
      input: 'drop',
      at: { x: 1360, y: 330 },
    })
  })

  it('签只在一幕带着它、跟手时画', () => {
    const page = desk()
    const label = [{ text: '应用外面' }, { text: '松手就停在这里，双击回到应用' }]
    const hand = { mode: 'hand', at: { x: 1100, y: 200 } } as const
    page.send({ kind: 'scene', scene: scene(9, 1, hand, { label }) })
    expect(page.view.container.textContent).toContain('松手就停在这里，双击回到应用')
    page.send({ kind: 'scene', scene: scene(9, 2, hand) })
    expect(page.view.container.textContent).not.toContain('应用外面')
  })

  it('落定或回程的幕带着签也不画', () => {
    const page = desk()
    const label = [{ text: '应用外面' }]
    page.send({ kind: 'scene', scene: scene(9, 1, { mode: 'rest', at: ORIGIN }, { label }) })
    page.send({ kind: 'scene', scene: scene(9, 2, { mode: 'home', at: ORIGIN }, { label }) })
    expect(page.view.container.textContent).not.toContain('应用外面')
  })
})

describe('桌面层的页面：说话笺', () => {
  const rest = { mode: 'rest', at: { x: 1200, y: 300 } } as const
  const note = (more: Partial<NonNullable<Scene['note']>> = {}): Scene['note'] => ({
    targets: [{ key: 's-1', label: '周报' }],
    to: { kind: 'new' },
    fate: null,
    words: '',
    edit: 0,
    ...more,
  })
  const bubble = () => document.querySelector<HTMLElement>('.omne-say-bubble')
  const field = () => document.querySelector<HTMLTextAreaElement>('.omne-say-field')!
  const type = (text: string) => fireEvent.change(field(), { target: { value: text } })
  const inputs = (page: ReturnType<typeof desk>) =>
    page.posted.filter(message => message.kind === 'input')

  it('一幕带笺时画说话笺，不带时不画', () => {
    const page = desk()
    page.send({ kind: 'scene', scene: scene(10, 1, rest) })
    expect(bubble()).toBeNull()
    page.send({ kind: 'scene', scene: scene(10, 2, rest, { note: note() }) })
    expect(bubble()).not.toBeNull()
  })

  it('回车报发送，带字与说给谁；缺省说给新会话或那个键', () => {
    const page = desk()
    page.send({ kind: 'scene', scene: scene(10, 1, rest, { note: note() }) })
    type('帮我看一下周报')
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(inputs(page)).toEqual([
      { kind: 'input', lease: 10, input: 'send', words: '帮我看一下周报', to: { kind: 'new' } },
    ])
    const to = { kind: 'target', key: 's-1' } as const
    page.send({ kind: 'scene', scene: scene(11, 1, rest, { note: note({ to }) }) })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(inputs(page).at(-1)).toMatchObject({ lease: 11, input: 'send', to })
  })

  it('Escape 与收起钮报收起', () => {
    const page = desk()
    page.send({ kind: 'scene', scene: scene(10, 1, rest, { note: note() }) })
    fireEvent.keyDown(field(), { key: 'Escape' })
    fireEvent.click(document.querySelector('.omne-say-row button')!)
    expect(inputs(page)).toEqual([
      { kind: 'input', lease: 10, input: 'close', at: null },
      { kind: 'input', lease: 10, input: 'close', at: null },
    ])
  })

  it('受理了之后按去对话页报 show', () => {
    const page = desk()
    page.send({
      kind: 'scene',
      scene: scene(10, 1, rest, { note: note({ fate: { kind: 'accepted' } }) }),
    })
    fireEvent.click(document.querySelector('.omne-say-row button')!)
    expect(inputs(page)).toEqual([{ kind: 'input', lease: 10, input: 'show', at: null }])
  })

  it('窗口失焦：字段里没有字报收起，有字什么都不报；笺收着时不报', () => {
    const page = desk()
    page.send({ kind: 'scene', scene: scene(10, 1, rest) })
    act(() => void window.dispatchEvent(new Event('blur')))
    expect(inputs(page)).toEqual([])
    page.send({ kind: 'scene', scene: scene(10, 2, rest, { note: note() }) })
    type('写了一半')
    act(() => void window.dispatchEvent(new Event('blur')))
    expect(inputs(page)).toEqual([])
    type('  ')
    act(() => void window.dispatchEvent(new Event('blur')))
    expect(inputs(page)).toEqual([{ kind: 'input', lease: 10, input: 'close', at: null }])
  })

  it('字段跟着一幕的 edit：受理了外壳清字、edit 加一，字段跟着变空；没发出与不知道时 edit 不变，字留着', () => {
    const page = desk()
    const sending = { fate: { kind: 'sending' } } as const
    page.send({ kind: 'scene', scene: scene(10, 1, rest, { note: note() }) })
    type('一')
    page.send({
      kind: 'scene',
      scene: scene(10, 2, rest, { note: note({ ...sending, words: '一' }) }),
    })
    page.send({
      kind: 'scene',
      scene: scene(10, 3, rest, {
        note: note({ fate: { kind: 'failed', reason: '不行' }, words: '一' }),
      }),
    })
    expect(field().value).toBe('一')
    page.send({
      kind: 'scene',
      scene: scene(10, 4, rest, { note: note({ ...sending, words: '一' }) }),
    })
    page.send({
      kind: 'scene',
      scene: scene(10, 5, rest, { note: note({ fate: { kind: 'accepted' }, edit: 1 }) }),
    })
    expect(field().value).toBe('')
    type('二')
    page.send({ kind: 'scene', scene: scene(10, 6, rest, { note: note({ ...sending, edit: 1 }) }) })
    page.send({
      kind: 'scene',
      scene: scene(10, 7, rest, { note: note({ fate: { kind: 'unknown' }, edit: 1 }) }),
    })
    expect(field().value).toBe('二')
  })

  it('笺从没有变成有：字段取一幕里的字与人选的说给谁', () => {
    const page = desk()
    const chosen = { kind: 'target', key: 's-1' } as const
    page.send({
      kind: 'scene',
      scene: scene(10, 1, rest, { note: note({ words: '窗口里写的', chosen }) }),
    })
    expect(field().value).toBe('窗口里写的')
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(inputs(page).at(-1)).toMatchObject({ input: 'send', words: '窗口里写的', to: chosen })
    page.send({ kind: 'scene', scene: scene(10, 2, rest) })
    page.send({ kind: 'scene', scene: scene(10, 3, rest, { note: note({ words: '又改过' }) }) })
    expect(field().value).toBe('又改过')
  })

  it('edit 没变的重发一幕不改字段；edit 变了取一幕里的', () => {
    const page = desk()
    page.send({ kind: 'scene', scene: scene(10, 1, rest, { note: note({ words: '甲' }) }) })
    type('甲乙')
    page.send({ kind: 'scene', scene: scene(10, 2, rest, { note: note({ words: '甲' }) }) })
    expect(field().value).toBe('甲乙')
    page.send({
      kind: 'scene',
      scene: scene(10, 3, rest, { note: note({ words: '丙', edit: 1 }) }),
    })
    expect(field().value).toBe('丙')
  })

  it('一帧里改三次只发一条 unsent：带租约号、最后的字与说给谁、对着的 edit', () => {
    const page = desk()
    page.send({ kind: 'scene', scene: scene(10, 1, rest, { note: note({ edit: 3 }) }) })
    type('一')
    type('一二')
    type('一二三')
    expect(inputs(page)).toEqual([])
    page.frame()
    expect(inputs(page)).toEqual([
      { kind: 'input', lease: 10, input: 'unsent', words: '一二三', edit: 3 },
    ])
    page.frame()
    expect(inputs(page)).toHaveLength(1)
  })

  it('按收起或 Escape：先补发还没发的那一份，再发收起', () => {
    const page = desk()
    page.send({ kind: 'scene', scene: scene(10, 1, rest, { note: note() }) })
    type('半句')
    fireEvent.click(document.querySelector('.omne-say-row button')!)
    type('半句话')
    fireEvent.keyDown(field(), { key: 'Escape' })
    page.frame()
    expect(inputs(page)).toEqual([
      { kind: 'input', lease: 10, input: 'unsent', words: '半句', edit: 0 },
      { kind: 'input', lease: 10, input: 'close', at: null },
      { kind: 'input', lease: 10, input: 'unsent', words: '半句话', edit: 0 },
      { kind: 'input', lease: 10, input: 'close', at: null },
    ])
  })

  it('正在发时字段只读：打字不改字段，也不发 unsent', () => {
    const page = desk()
    const sending = { fate: { kind: 'sending' }, words: '在吗' } as const
    page.send({ kind: 'scene', scene: scene(10, 1, rest, { note: note(sending) }) })
    type('在吗？？')
    page.frame()
    expect(field().value).toBe('在吗')
    expect(inputs(page)).toEqual([])
  })

  it('hot 里有笺的矩形：笺开时、收时重报', () => {
    const box = { x: 1222, y: 311, width: 360, height: 120 }
    const measured = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      const { x, y, width, height } = this.classList.contains('omne-say-bubble')
        ? { ...box, x: box.x - ORIGIN.x }
        : { x: 0, y: 0, width: 0, height: 0 }
      return {
        x,
        y,
        width,
        height,
        left: x,
        top: y,
        right: x + width,
        bottom: y + height,
      } as DOMRect
    }
    try {
      const page = desk()
      const around = { x: 1200 - 62, y: 300 - 62, width: 124, height: 124 }
      page.send({ kind: 'scene', scene: scene(10, 1, rest) })
      expect(page.hot.at(-1)).toEqual([10, [around]])
      page.send({ kind: 'scene', scene: scene(10, 2, rest, { note: note() }) })
      page.frame()
      expect(page.hot.at(-1)).toEqual([10, [around, box]])
      page.send({ kind: 'scene', scene: scene(10, 3, rest) })
      expect(page.hot.at(-1)).toEqual([10, [around]])
    } finally {
      HTMLElement.prototype.getBoundingClientRect = measured
    }
  })
})

describe('桌面层的页面：观测框与按着 ⌘ 的签', () => {
  const hand = { mode: 'hand', at: { x: 1100, y: 200 } } as const
  const frame = {
    rect: { x: 1100, y: 100, width: 400, height: 300 },
    covered: [{ x: 1400, y: 80, width: 200, height: 100 }],
    closed: false,
  }
  const frames = () => [...document.querySelectorAll<SVGSVGElement>('.omne-observation-frame')]

  it('照一幕画观测框：矩形从屏幕上的点换成视口里的点；它不进 hot', () => {
    const page = desk()
    page.send({ kind: 'scene', scene: scene(9, 1, hand, { frame }) })
    expect(frames().map(svg => svg.getAttribute('viewBox'))).toEqual(['92 92 416 316'])
    expect(page.hot.at(-1)?.[1]).toHaveLength(1)
  })

  it('一幕不画形时不画框', () => {
    const page = desk()
    page.send({ kind: 'scene', scene: scene(9, 1, { mode: 'none' }, { frame }) })
    expect(frames()).toEqual([])
  })

  it('按着 ⇧ 时框合口，签的「松手直接发送」一行用提示色', () => {
    const page = desk()
    const label = [{ text: 'Safari · 报错' }, { text: '松手直接发送', tone: 'hint' as const }]
    page.send({
      kind: 'scene',
      scene: scene(9, 1, hand, { frame: { ...frame, closed: true }, label }),
    })
    expect(frames()[0]?.dataset['closed']).toBe('true')
    const hint = document.querySelector<HTMLElement>(".omne-figure-label-line[data-tone='hint']")
    expect(hint?.textContent).toBe('松手直接发送')
    expect(page.view.container.textContent).toContain('Safari · 报错')
  })

  it('按着 ⌘ 与 ⇧ 时修饰键随拿起与松手报给外壳', () => {
    const page = desk()
    page.send({ kind: 'scene', scene: scene(6, 1, { mode: 'rest', at: { x: 1300, y: 300 } }) })
    const reach = page.view.container.querySelector<HTMLElement>('.omne-figure-reach')!
    const at = (x: number, y: number, buttons: number) => ({
      pointerId: 1,
      button: 0,
      buttons,
      clientX: x,
      clientY: y,
      metaKey: true,
      shiftKey: true,
    })
    act(() => void fireEvent.pointerDown(reach, at(300, 300, 1)))
    act(() => void fireEvent.pointerMove(reach, at(340, 320, 1)))
    page.frame()
    act(() => void fireEvent.pointerUp(reach, at(360, 330, 0)))
    const inputs = page.posted.flatMap(message => (message.kind === 'input' ? [message] : []))
    const keys = inputs.map(input => [
      input.input,
      'meta' in input && input.meta,
      'shift' in input && input.shift,
    ])
    expect([keys[0], keys.at(-1)]).toEqual([
      ['lift', true, true],
      ['drop', true, true],
    ])
  })
})

describe('桌面层的页面：笺里的图', () => {
  const rest = { mode: 'rest', at: { x: 1200, y: 300 } } as const
  const PICTURES = [
    { id: '1', name: '窗口 09.05.07.png' },
    { id: '2', name: '近看 09.05.07.png' },
  ]
  const note = (more: Partial<NonNullable<Scene['note']>> = {}): Scene['note'] => ({
    targets: [{ key: 's-1', label: '周报' }],
    to: { kind: 'new' },
    fate: null,
    pictures: PICTURES,
    words: '',
    edit: 0,
    ...more,
  })
  const bytes = (id: string) =>
    ({ kind: 'picture', id, bytes: new Uint8Array([Number(id)]) }) as const
  const thumbs = () =>
    [...document.querySelectorAll<HTMLImageElement>('.omne-say-thumb')].map(img => img.alt)
  const inputs = (page: ReturnType<typeof desk>) =>
    page.posted.filter(message => message.kind === 'input')
  const field = () => document.querySelector<HTMLTextAreaElement>('.omne-say-field')!

  beforeEach(() => {
    let made = 0
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:picture-${(made += 1)}`)
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  })
  afterEach(() => vi.restoreAllMocks())

  it('按标识把字节接到笺上：字节先到或后到都接得上，没到的不画', () => {
    const page = desk()
    page.send(bytes('1'))
    page.send({ kind: 'scene', scene: scene(10, 1, rest, { note: note() }) })
    expect(thumbs()).toEqual(['窗口 09.05.07.png'])
    page.send(bytes('2'))
    expect(thumbs()).toEqual(['窗口 09.05.07.png', '近看 09.05.07.png'])
  })

  it('一幕不再提的图，字节丢掉', () => {
    const page = desk()
    page.send(bytes('1'))
    page.send(bytes('2'))
    page.send({
      kind: 'scene',
      scene: scene(10, 1, rest, { note: note({ pictures: [PICTURES[1]!] }) }),
    })
    page.send({ kind: 'scene', scene: scene(10, 2, rest, { note: note() }) })
    expect(thumbs()).toEqual(['近看 09.05.07.png'])
  })

  it('去掉一张：报给外壳，带那张的标识', () => {
    const page = desk()
    page.send(bytes('1'))
    page.send(bytes('2'))
    page.send({ kind: 'scene', scene: scene(10, 1, rest, { note: note() }) })
    fireEvent.click(document.querySelector("[aria-label='去掉近看 09.05.07.png']")!)
    expect(inputs(page)).toEqual([{ kind: 'input', lease: 10, input: 'unpicture', picture: '2' }])
  })

  it('发送带上笺里留着的图的标识', () => {
    const page = desk()
    page.send(bytes('1'))
    page.send(bytes('2'))
    page.send({ kind: 'scene', scene: scene(10, 1, rest, { note: note() }) })
    fireEvent.change(field(), { target: { value: '这是什么意思' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(inputs(page)).toEqual([
      {
        kind: 'input',
        lease: 10,
        input: 'send',
        words: '这是什么意思',
        to: { kind: 'new' },
        pictures: ['1', '2'],
      },
    ])
  })

  it('窗口失焦：字段里没有字但笺里有图，不报收起', () => {
    const page = desk()
    page.send(bytes('1'))
    page.send({ kind: 'scene', scene: scene(10, 1, rest, { note: note() }) })
    act(() => void window.dispatchEvent(new Event('blur')))
    expect(inputs(page)).toEqual([])
  })

  it('没有许可：写说明，按打开系统设置报给外壳', () => {
    const page = desk()
    const told = { kind: 'not-authorized' } as const
    page.send({ kind: 'scene', scene: scene(10, 1, rest, { note: note({ pictures: [], told }) }) })
    expect(page.view.container.textContent).toContain(
      '需要在系统设置里允许 omne 录制屏幕，才能看这个窗口',
    )
    const settings = [...document.querySelectorAll('button')].find(
      button => button.textContent === '打开系统设置',
    )
    fireEvent.click(settings!)
    expect(inputs(page)).toEqual([{ kind: 'input', lease: 10, input: 'settings', at: null }])
  })

  it('现在发不了图、没能看这个窗口：照说明写', () => {
    const page = desk()
    page.send({
      kind: 'scene',
      scene: scene(10, 1, rest, { note: note({ told: { kind: 'cannot-send-pictures' } }) }),
    })
    expect(page.view.container.textContent).toContain('现在发不了图')
    const failed = { kind: 'not-seen', reason: '截这个窗口时出错' } as const
    page.send({
      kind: 'scene',
      scene: scene(10, 2, rest, { note: note({ pictures: [], told: failed }) }),
    })
    expect(page.view.container.textContent).toContain('没能看这个窗口：截这个窗口时出错')
  })
})

describe('桌面层的页面：一幕什么时候画', () => {
  const rest = { mode: 'rest', at: { x: 1200, y: 300 } } as const
  const hand = { mode: 'hand', at: { x: 1100, y: 200 } } as const
  const home = { mode: 'home', at: { x: 1100, y: 600 } } as const
  const written = (version: number, issuer = ISSUER) => ({
    look: { theme: 'light', size: 'medium', reduced: true, issuer, version } as const,
  })
  const worn = (version: number, issuer = ISSUER): LookProjection => ({ ...WORN, issuer, version })

  it('手里没有投影：留着不画，不报「空了」，外壳还没有一份时的版本 0 也一样；换上之后画并补报', () => {
    const page = desk({ worn: null })
    page.send({ kind: 'scene', scene: scene(7, 1, { mode: 'none' }, written(0)) })
    expect(page.handovers()).toEqual([])
    page.look(worn(1))
    expect(page.handovers()).toEqual([{ kind: 'cleared', lease: 7, serial: 1 }])
  })

  it('手里没有投影时留着别的外壳的一幕：换上那个外壳的投影就画，并报 hot', () => {
    const page = desk({ worn: null })
    page.send({ kind: 'scene', scene: scene(8, 1, rest, written(1, 'shell-2')) })
    expect(page.hot).toEqual([])
    page.look(worn(1, 'shell-2'))
    expect(page.main().dataset['mode']).toBe('rest')
    expect(page.hot).toHaveLength(1)
  })

  it('issuer 和手里的不同：留着不画，不报 hot；那个外壳的投影作废它，等它的下一幕', () => {
    const page = desk()
    page.send({ kind: 'scene', scene: scene(8, 1, rest, written(1, 'shell-2')) })
    expect(page.main().dataset['mode']).toBe('none')
    expect(page.hot).toEqual([])
    page.look(worn(1, 'shell-2'))
    expect(page.main().dataset['mode']).toBe('none')
    page.send({ kind: 'scene', scene: scene(8, 2, rest, written(1, 'shell-2')) })
    expect(page.main().dataset['mode']).toBe('rest')
    expect(page.hot).toHaveLength(1)
  })

  it('版本比手里的大：留着不画，不报「画好了」；换上之后画，第一帧补报', () => {
    const page = desk()
    page.send({ kind: 'scene', scene: scene(5, 1, hand, written(2)) })
    page.frame()
    expect(page.handovers()).toEqual([])
    expect(page.main().dataset['mode']).toBe('none')
    page.look(worn(2))
    expect(page.main().dataset['mode']).toBe('hand')
    page.frame()
    expect(page.handovers()).toEqual([{ kind: 'painted', lease: 5, serial: 1 }])
  })

  it('版本不比手里的小：照常画', () => {
    const page = desk({ worn: worn(3) })
    page.send({ kind: 'scene', scene: scene(8, 1, rest, written(2)) })
    expect(page.main().dataset['mode']).toBe('rest')
    expect(page.hot).toHaveLength(1)
  })

  it('同一笔回程留着的那一幕：换上之后补报「到了」', () => {
    const page = desk()
    page.send({ kind: 'scene', scene: scene(6, 3, home) })
    expect(page.handovers()).toEqual([{ kind: 'arrived', lease: 6, serial: 3 }])
    page.send({ kind: 'scene', scene: scene(6, 4, home, written(2)) })
    expect(page.handovers()).toHaveLength(1)
    page.look(worn(2))
    expect(page.handovers().at(-1)).toEqual({ kind: 'arrived', lease: 6, serial: 4 })
  })

  it('只留最新的一幕：换上之后只画它、只为它报', () => {
    const page = desk()
    page.send({ kind: 'scene', scene: scene(7, 1, rest, written(2)) })
    page.send({ kind: 'scene', scene: scene(7, 2, { mode: 'none' }, written(2)) })
    page.send({ kind: 'scene', scene: scene(7, 1, hand, written(2)) })
    page.look(worn(2))
    expect(page.main().dataset['mode']).toBe('none')
    expect(page.handovers()).toEqual([{ kind: 'cleared', lease: 7, serial: 2 }])
    expect(page.hot).toEqual([])
  })

  it('留着时来了够新的一幕：画它，丢掉留着的', () => {
    const page = desk()
    page.send({ kind: 'scene', scene: scene(7, 1, rest, written(2)) })
    page.send({ kind: 'scene', scene: scene(7, 2, { mode: 'none' }, written(1)) })
    expect(page.handovers()).toEqual([{ kind: 'cleared', lease: 7, serial: 2 }])
    page.look(worn(2))
    expect(page.handovers()).toHaveLength(1)
    expect(page.main().dataset['mode']).toBe('none')
  })

  it('别的 issuer 的更新的投影：手里的幕作废，什么都不画，也不报', () => {
    const page = desk()
    page.send({ kind: 'scene', scene: scene(8, 1, rest) })
    expect(page.main().dataset['mode']).toBe('rest')
    page.look(worn(1, 'shell-2'))
    expect(page.main().dataset['mode']).toBe('none')
    expect(page.handovers()).toEqual([])
    page.send({ kind: 'scene', scene: scene(8, 2, rest) })
    expect(page.main().dataset['mode']).toBe('none')
    page.send({ kind: 'scene', scene: scene(9, 1, rest, written(1, 'shell-2')) })
    expect(page.main().dataset['mode']).toBe('rest')
  })

  it('别的 issuer 的投影还在备时到了旧外壳的一幕：不画，不报', () => {
    const figure = {
      point: 'shell.piece',
      key: 'figure',
      source: { module: '/bridge/plugins/x/1/a.js', export: 'figure' },
    }
    const page = desk({ load: () => new Promise(() => undefined) })
    page.send({ kind: 'scene', scene: scene(8, 1, rest) })
    expect(page.main().dataset['mode']).toBe('rest')
    const sent = page.hot.length
    page.look({ ...worn(1, 'shell-2'), drawings: [figure] })
    expect(page.main().dataset['mode']).toBe('none')
    page.send({ kind: 'scene', scene: scene(8, 2, hand) })
    page.frame()
    expect(page.main().dataset['mode']).toBe('none')
    expect(page.handovers()).toEqual([])
    expect(page.hot).toHaveLength(sent)
  })

  it('别的 issuer 的更新的投影也作废留着的幕', () => {
    const page = desk()
    page.send({ kind: 'scene', scene: scene(8, 1, rest, written(2)) })
    page.look(worn(1, 'shell-2'))
    page.look(worn(2))
    expect(page.main().dataset['mode']).toBe('none')
    expect(page.hot).toEqual([])
  })

  it('手的位置不等：留着一幕时照常跟着画着的那一幕', async () => {
    const figure = {
      point: 'shell.piece',
      key: 'figure',
      source: { module: '/bridge/plugins/x/1/a.js', export: 'figure' },
    }
    const page = desk({ load: () => new Promise(() => undefined) })
    const label = [{ text: '应用外面' }]
    page.send({ kind: 'scene', scene: scene(9, 1, hand, { label }) })
    page.look({ ...worn(2), drawings: [figure] })
    page.send({ kind: 'scene', scene: scene(9, 2, hand, { ...written(2), label }) })
    const placed = () =>
      page.view.container.querySelector<HTMLElement>('.omne-figure-label')!.style.cssText
    const before = placed()
    page.send({ kind: 'hand', lease: 9, at: { x: 1400, y: 600 } })
    expect(placed()).not.toBe(before)
  })
})

describe('桌面层的页面：部位与换画口', () => {
  const hand = { mode: 'hand', at: { x: 1100, y: 200 } } as const
  const FIGURE = {
    point: 'shell.piece',
    key: 'figure',
    source: { module: '/bridge/plugins/sea/1/look.js', export: 'figure' },
  }
  const skinned = (made: (given: { React: typeof React }) => unknown) => ({
    load: async () => ({ figure: made }),
  })
  const drawsSkin =
    ({ React: given }: { React: typeof React }) =>
    () =>
      given.createElement('i', { className: 'skin-figure' })

  it('形、签、说话笺、观测框的根元素带着外壳声明的部位名', () => {
    const page = desk()
    const label = [{ text: '应用外面' }]
    const frame = { rect: { x: 1100, y: 100, width: 400, height: 300 }, covered: [], closed: false }
    const note = { targets: [], to: { kind: 'new' }, fate: null, words: '', edit: 0 } as const
    page.send({ kind: 'scene', scene: scene(9, 1, hand, { label, frame, note }) })
    const named = (part: { props: Readonly<Record<string, string>> }) =>
      page.view.container.querySelectorAll(`[data-omne-part="${part.props['data-omne-part']}"]`)
    expect(named(shellFigure)).toHaveLength(1)
    expect(named(shellFigureLabel)[0]?.classList.contains('omne-figure-label')).toBe(true)
    expect(document.querySelector(`[data-omne-part="${shellFigureNote.name}"]`)).toBe(bubble())
    expect(named(shellFigureFrame)[0]?.classList.contains('omne-observation-frame')).toBe(true)
  })
  const bubble = () => document.querySelector('.omne-say-bubble')

  it('换画口取到画法时形是那份画法画的；取不到时是自带的；换上新的一份就重画', async () => {
    const page = desk(skinned(drawsSkin))
    const drawnBy = () =>
      ['.skin-figure', '.omne-figure-ink'].filter(
        selector => page.main().querySelector(selector) !== null,
      )
    page.send({ kind: 'scene', scene: scene(9, 1, hand) })
    expect(drawnBy()).toEqual(['.omne-figure-ink'])
    page.look({ ...WORN, version: 2, drawings: [FIGURE] })
    await page.settle()
    expect(drawnBy()).toEqual(['.skin-figure'])
    page.look({ ...WORN, version: 3 })
    expect(drawnBy()).toEqual(['.omne-figure-ink'])
  })

  it('画法画的时候抛出：那一处落回自带的，上行一次', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const throws = () => () => {
        throw new Error('bad paint')
      }
      const page = desk(skinned(throws))
      page.look({ ...WORN, version: 2, drawings: [FIGURE] })
      await page.settle()
      const look = {
        theme: 'light',
        size: 'medium',
        reduced: true,
        issuer: ISSUER,
        version: 2,
      } as const
      page.send({ kind: 'scene', scene: scene(9, 1, hand, { look }) })
      page.send({ kind: 'scene', scene: scene(9, 2, hand, { look }) })
      expect(page.main().querySelectorAll('.omne-figure-ink')).toHaveLength(1)
      const undrawn = page.posted.filter(message => message.kind === 'undrawn')
      expect(undrawn).toEqual([
        expect.objectContaining({
          point: 'shell.piece',
          key: 'figure',
          reason: expect.stringContaining('bad paint'),
        }),
      ])
    } finally {
      quiet.mockRestore()
    }
  })
})

describe('桌面层的页面：换上时页面做的事', () => {
  it('样式文本收养成一张排在页面自己之后的表，再换只重写它；摘掉启动脚本写在根上的令牌', () => {
    const own = new CSSStyleSheet()
    document.adoptedStyleSheets = [own]
    const root = document.documentElement
    root.style.setProperty('--omne-ink', 'red')
    root.dataset['bootTokens'] = '--omne-ink'
    const wear = wearOn(document)
    wear.adopt(':root { --omne-ink: blue; }')
    wear.adopt(':root { --omne-ink: green; }')
    expect(document.adoptedStyleSheets).toHaveLength(2)
    expect(document.adoptedStyleSheets[0]).toBe(own)
    const rules = [...document.adoptedStyleSheets[1]!.cssRules].map(rule => rule.cssText)
    expect(rules.join('')).toContain('green')
    wear.drop()
    expect(root.style.getPropertyValue('--omne-ink')).toBe('')
    expect(root.dataset['bootTokens']).toBeUndefined()
    document.adoptedStyleSheets = []
  })
})
