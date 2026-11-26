// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FigureLabel,
  FigureSeat,
  FigureStage,
  InkBubble,
  InkMotes,
  LooseFigure,
  ObservationFrame,
  SayBubble,
  ToldNote,
} from '../src/index.ts'
import { casual } from '../src/ink/casual.ts'
import { inkClock } from '../src/ink/clock.ts'
import { type Box } from '../src/ink/travel.ts'
import { type DataAttributes } from '../src/patterns/ai/data-attributes.ts'

const FIGURE: Box = { x: 272, y: 172, width: 56, height: 56 }
const BOUNDS: Box = { x: 0, y: 0, width: 1200, height: 800 }
const HOME = { x: 100, y: 80 }
const PART = 'data-omne-part'
const CALLER = 'from-the-caller'

function boxed({ x, y, width, height }: Box): DOMRect {
  return {
    x,
    y,
    left: x,
    top: y,
    width,
    height,
    right: x + width,
    bottom: y + height,
    toJSON: () => ({}),
  }
}

function frames(): (ms: number) => void {
  let due = new Map<number, FrameRequestCallback>()
  let next = 0
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  })
  vi.setSystemTime(0)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    next += 1
    due.set(next, callback)
    return next
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => due.delete(id))
  inkClock.use(() => Date.now())
  casual.use(() => 0.5)
  return ms =>
    act(() => {
      for (let i = 0; i < ms; i += 1) {
        vi.advanceTimersByTime(1)
        const now = due
        due = new Map()
        for (const callback of now.values()) callback(Date.now())
      }
    })
}

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0.25)
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.dataset['figureSeat'] === 'home')
      return boxed({ x: HOME.x - 12, y: HOME.y - 12, width: 24, height: 24 })
    if (this.classList.contains('omne-ink-bubble'))
      return boxed({ x: 340, y: 160, width: 220, height: 60 })
    return boxed({ x: 0, y: 0, width: 0, height: 0 })
  })
  for (const key of ['offsetWidth', 'offsetHeight'] as const)
    vi.spyOn(HTMLElement.prototype, key, 'get').mockImplementation(function (this: HTMLElement) {
      if (
        !this.classList.contains('omne-ink-bubble') &&
        !this.classList.contains('omne-figure-label')
      )
        return 0
      return key === 'offsetWidth' ? 220 : 60
    })
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  casual.use(null)
  inkClock.use(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

interface Piece {
  readonly name: string
  readonly draw: (data: DataAttributes) => React.JSX.Element
  readonly root: string
  readonly own: { readonly name: `data-${string}`; readonly at: string }
}

const SAY = { targets: [{ id: 'new', name: '新会话' }], target: 'new', text: '' }
const noop = (): void => undefined

const PIECES: readonly Piece[] = [
  {
    name: 'FigureStage, the layer of the figure',
    draw: data => <FigureStage label="形" {...data} />,
    root: '.omne-figure-layer',
    own: { name: 'data-figure-own', at: '.omne-figure-layer' },
  },
  {
    name: 'LooseFigure',
    draw: data => <LooseFigure mode="rest" at={HOME} {...data} />,
    root: '.omne-figure-layer',
    own: { name: 'data-mode', at: '.omne-figure-carried' },
  },
  {
    name: 'FigureLabel',
    draw: data => (
      <FigureLabel figure={FIGURE} bounds={BOUNDS} lines={[{ text: '名字' }]} {...data} />
    ),
    root: '.omne-figure-label',
    own: { name: 'data-tone', at: '.omne-figure-label-line' },
  },
  {
    name: 'SayBubble',
    draw: data => (
      <SayBubble
        note={SAY}
        figure={FIGURE}
        bounds={BOUNDS}
        onTarget={noop}
        onText={noop}
        onSend={noop}
        onClose={noop}
        onOpen={noop}
        {...data}
      />
    ),
    root: '.omne-say-bubble',
    own: { name: 'data-ink-strength', at: '.omne-say-bubble' },
  },
  {
    name: 'ToldNote',
    draw: data => (
      <FigureStage label="形">
        <FigureSeat name="home" />
        <ToldNote said={{ id: 't1', text: '写好了' }} {...data} />
      </FigureStage>
    ),
    root: '.omne-told-note',
    own: { name: 'data-ink-strength', at: '.omne-told-note' },
  },
  {
    name: 'ObservationFrame',
    draw: data => (
      <ObservationFrame
        rect={{ x: 100, y: 100, width: 400, height: 300 }}
        covered={[]}
        figure={FIGURE}
        {...data}
      />
    ),
    root: '.omne-observation-frame',
    own: { name: 'data-closed', at: '.omne-observation-frame' },
  },
  {
    name: 'InkBubble',
    draw: data => (
      <InkBubble figure={FIGURE} origin={[340, 160]} role="note" {...data}>
        字
      </InkBubble>
    ),
    root: '.omne-ink-bubble',
    own: { name: 'data-ink-strength', at: '.omne-ink-bubble' },
  },
  {
    name: 'InkMotes',
    draw: data => <InkMotes doing="thinking" {...data} />,
    root: '[data-ink-motes]',
    own: { name: 'data-ink-motes', at: '[data-ink-motes]' },
  },
]

const anyId = (html: string): string => html.replace(/(«r|:r|_r_)[0-9a-z]+(»|:|_)/g, 'ID')

function drawn(piece: Piece, data: DataAttributes): string {
  const wait = frames()
  const { container } = render(piece.draw(data))
  wait(40)
  const html = container.innerHTML
  cleanup()
  vi.useRealTimers()
  return anyId(html)
}

function found(selector: string): Element {
  const element = document.querySelector(selector)
  if (element === null) throw new Error(`nothing is drawn at ${selector}`)
  return element
}

describe('the pieces that draw in ink carry the data the caller gives (FE-I69)', () => {
  it.each(PIECES)('$name puts the name of the part on its root element', piece => {
    const wait = frames()
    render(piece.draw({ [PART]: 'figure-label' }))
    wait(40)
    expect(found(piece.root).getAttribute(PART)).toBe('figure-label')
  })

  it.each(PIECES)('$name keeps its own data when the caller gives the same name', piece => {
    const wait = frames()
    const view = render(piece.draw({}))
    wait(40)
    const own = found(piece.own.at).getAttribute(piece.own.name)
    expect(own).not.toBeNull()
    expect(own).not.toBe(CALLER)
    view.unmount()
    render(piece.draw({ [piece.own.name]: CALLER }))
    wait(40)
    expect(found(piece.own.at).getAttribute(piece.own.name)).toBe(own)
  })

  it.each(PIECES)(
    '$name draws the same markup, but for the name, as when it is given none',
    piece => {
      const bare = drawn(piece, {})
      const named = drawn(piece, { [PART]: 'part' })
      expect(named).not.toBe(bare)
      expect(named.replace(` ${PART}="part"`, '')).toBe(bare)
    },
  )
})
