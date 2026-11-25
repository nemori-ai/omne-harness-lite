// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { DeskPage, type DeskDeps } from '../src/page/desk/desk.tsx'
import type { Down, Rect, Scene, Up } from '../src/page/desk/scene.ts'

const ORIGIN = { x: 1000, y: 0 }

function scene(lease: number, serial: number, where: Scene['where'], more?: Partial<Scene>): Scene {
  return {
    lease,
    serial,
    look: { theme: 'light', size: 'medium', reduced: true },
    figure: { waiting: 0 },
    where,
    label: null,
    ...more,
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

function desk() {
  const posted: Up[] = []
  const hot: (readonly [number, readonly Rect[]])[] = []
  const frames: (() => void)[] = []
  let listener: ((message: Down) => void) | undefined
  const deps: DeskDeps = {
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

  it('照一幕写形的状态与待答数、观感；跟手时手的位置走小消息', () => {
    const page = desk()
    const look = { theme: 'dark', size: 'large', reduced: true } as const
    const figure = { doing: 'thinking', waiting: 1 } as const
    page.send({ kind: 'scene', scene: scene(9, 1, { mode: 'rest', at: ORIGIN }, { look, figure }) })
    expect(page.main().dataset).toMatchObject({ doing: 'thinking', waiting: '1' })
    expect(document.documentElement.dataset).toMatchObject({ theme: 'dark', size: 'large' })
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
})
