// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { createRef, type ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FIGURE_SIZE,
  FigureSeat,
  FigureStage,
  LooseFigure,
  RedrawProvider,
  type LooseControl,
  type Redraw,
} from '../src/index.ts'
import { FigureBody } from '../src/ink/body.ts'
import { casual } from '../src/ink/casual.ts'
import { inkClock } from '../src/ink/clock.ts'
import { FOLLOW } from '../src/ink/hand.ts'

const REACH = 34
const STYLES = readFileSync(join(import.meta.dirname, '../src/ink/ink.css'), 'utf8')

type Point = readonly [number, number]

interface Clock {
  readonly wait: (ms: number) => void
  readonly requested: () => number
}

function frameClock(): Clock {
  let frames = new Map<number, FrameRequestCallback>()
  let next = 0
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  })
  vi.setSystemTime(0)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    next += 1
    frames.set(next, callback)
    return next
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id)
  })
  inkClock.use(() => Date.now())
  casual.use(() => 0.5)
  return {
    wait(ms) {
      act(() => {
        for (let i = 0; i < ms; i += 1) {
          vi.advanceTimersByTime(1)
          const due = frames
          frames = new Map()
          for (const callback of due.values()) callback(Date.now())
        }
      })
    },
    requested: () => next,
  }
}

type Props = ComponentProps<typeof LooseFigure>

const at = ([x, y]: Point): { readonly x: number; readonly y: number } => ({ x, y })

const translated = ([x, y]: Point, size = FIGURE_SIZE): string =>
  `translate(${(x - size / 2).toFixed(2)}px, ${(y - size / 2).toFixed(2)}px)`

const carried = (): HTMLElement | null => document.querySelector('.omne-figure-carried')
const reachable = (): HTMLElement | null => document.querySelector('[data-control="figure"]')

function where(): Point {
  const match = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(carried()?.style.transform ?? '')
  if (match === null) throw new Error('the figure is not placed')
  return [Number(match[1]) + FIGURE_SIZE / 2, Number(match[2]) + FIGURE_SIZE / 2]
}

const remnants = (): number => document.querySelectorAll('.omne-figure-remnant').length

function press([x, y]: Point, kind: 'down' | 'move' | 'up', buttons = 1): void {
  const target = reachable()
  if (target === null) throw new Error('nothing takes the pointer')
  const init = { pointerId: 1, button: 0, buttons, clientX: x, clientY: y, screenX: x, screenY: y }
  act(() => {
    if (kind === 'down') fireEvent.pointerDown(target, init)
    else if (kind === 'move') fireEvent.pointerMove(target, init)
    else fireEvent.pointerUp(target, { ...init, buttons: 0 })
  })
}

function click(point: Point): void {
  press(point, 'down')
  press(point, 'up')
}

afterEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  cleanup()
  document.body.innerHTML = ''
  casual.use(null)
  casual.setStill(null)
  inkClock.use(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('the four modes (FE-I65)', () => {
  it('none draws nothing, takes no pointer, reaches nowhere and asks for no frame', () => {
    const time = frameClock()
    const control = createRef<LooseControl>()
    render(<LooseFigure mode="none" doing="thinking" waiting={2} control={control} />)
    time.wait(2000)
    expect(carried()).toBeNull()
    expect(reachable()).toBeNull()
    expect(document.querySelector('[data-figure-ink]')).toBeNull()
    expect(control.current?.reach()).toBeNull()
    expect(time.requested()).toBe(0)
  })

  it('rest writes the circle anew on the point, and its reach is the figure and 34px round it', () => {
    const time = frameClock()
    const written = vi.spyOn(FigureBody.prototype, 'writeAnew')
    const control = createRef<LooseControl>()
    render(<LooseFigure mode="rest" at={at([300, 200])} control={control} />)
    time.wait(20)
    expect(carried()?.style.transform).toBe(translated([300, 200]))
    expect(written).toHaveBeenCalledTimes(1)
    expect(reachable()).not.toBeNull()
    expect(control.current?.reach()).toEqual({
      x: 300 - FIGURE_SIZE / 2 - REACH,
      y: 200 - FIGURE_SIZE / 2 - REACH,
      width: FIGURE_SIZE + REACH * 2,
      height: FIGURE_SIZE + REACH * 2,
    })
  })

  it('its size is the one it is given, and the reach grows with it', () => {
    const time = frameClock()
    const control = createRef<LooseControl>()
    render(<LooseFigure mode="rest" at={at([300, 200])} size={70} control={control} />)
    time.wait(20)
    expect(carried()?.style.width).toBe('70px')
    expect(carried()?.style.transform).toBe(translated([300, 200], 70))
    expect(control.current?.reach()?.width).toBe(70 + REACH * 2)
  })

  it(`hand follows the points it is given with the spring of stiffness ${FOLLOW}: never past them`, () => {
    const time = frameClock()
    const view = render(<LooseFigure mode="hand" at={at([100, 200])} />)
    time.wait(20)
    expect(where()).toEqual([100, 200])
    view.rerender(<LooseFigure mode="hand" at={at([400, 200])} />)
    const xs: number[] = []
    for (let i = 0; i < 500; i += 1) {
      time.wait(1)
      xs.push(where()[0])
    }
    expect(xs.every((x, i) => x >= (xs[i - 1] ?? 100) && x <= 400)).toBe(true)
    expect(xs[99]).toBeGreaterThan(100 + 0.8 * 300)
    expect(xs.at(-1)).toBe(400)
  })

  it('rest after the hand settles on its point with the slower spring, without passing it', () => {
    const time = frameClock()
    const view = render(<LooseFigure mode="hand" at={at([100, 200])} />)
    time.wait(20)
    view.rerender(<LooseFigure mode="rest" at={at([400, 200])} />)
    const xs: number[] = []
    for (let i = 0; i < 1500; i += 1) {
      time.wait(1)
      xs.push(where()[0])
    }
    expect(xs.every((x, i) => x >= (xs[i - 1] ?? 100) && x <= 400)).toBe(true)
    expect(xs[99]).toBeLessThan(100 + 0.6 * 300)
    expect(xs[99]).toBeGreaterThan(100 + 0.2 * 300)
    expect(xs.at(-1)).toBe(400)
  })

  it('home writes one stroke to the point and calls onArrived once, when the stroke is there', () => {
    const time = frameClock()
    const arrived = vi.fn()
    const view = render(<LooseFigure mode="rest" at={at([600, 400])} onArrived={arrived} />)
    time.wait(700)
    view.rerender(<LooseFigure mode="home" at={at([80, 60])} onArrived={arrived} />)
    time.wait(50)
    expect(remnants()).toBeGreaterThan(0)
    expect(arrived).not.toHaveBeenCalled()
    time.wait(3000)
    expect(arrived).toHaveBeenCalledTimes(1)
    expect(where()).toEqual([80, 60])
    view.rerender(<LooseFigure mode="home" at={at([80, 60])} onArrived={arrived} />)
    time.wait(3000)
    expect(arrived).toHaveBeenCalledTimes(1)
  })

  it('home from nothing is there at once and has arrived', () => {
    const time = frameClock()
    const arrived = vi.fn()
    render(<LooseFigure mode="home" at={at([80, 60])} onArrived={arrived} />)
    time.wait(1)
    expect(arrived).toHaveBeenCalledTimes(1)
    expect(where()).toEqual([80, 60])
    expect(remnants()).toBe(0)
  })

  it('taken into the hand halfway home, the stroke stops, the circle is written under the hand and it never arrives', () => {
    const time = frameClock()
    const arrived = vi.fn()
    const written = vi.spyOn(FigureBody.prototype, 'writeAnew')
    const view = render(<LooseFigure mode="rest" at={at([600, 400])} onArrived={arrived} />)
    time.wait(700)
    view.rerender(<LooseFigure mode="home" at={at([80, 60])} onArrived={arrived} />)
    time.wait(150)
    const before = written.mock.calls.length
    view.rerender(<LooseFigure mode="hand" at={at([500, 300])} onArrived={arrived} />)
    expect(remnants()).toBe(0)
    expect(where()).toEqual([500, 300])
    expect(written.mock.calls.length).toBe(before + 1)
    time.wait(3000)
    expect(arrived).not.toHaveBeenCalled()
  })

  it('none after rest takes the figure away and lets go of a click that was waiting', () => {
    const time = frameClock()
    const clicked = vi.fn()
    const control = createRef<LooseControl>()
    const view = render(
      <LooseFigure mode="rest" at={at([300, 200])} onClick={clicked} control={control} />,
    )
    time.wait(20)
    click([300, 200])
    view.rerender(<LooseFigure mode="none" onClick={clicked} control={control} />)
    time.wait(1000)
    expect(carried()).toBeNull()
    expect(reachable()).toBeNull()
    expect(control.current?.reach()).toBeNull()
    expect(clicked).not.toHaveBeenCalled()
  })
})

describe('the same figure as the one on the page (FE-I65)', () => {
  it('its body takes the state, the waiting count and the moments through the same code', () => {
    const time = frameClock()
    const performed = vi.spyOn(FigureBody.prototype, 'perform')
    const waiting = vi.spyOn(FigureBody.prototype, 'setWaiting')
    const moment = vi.spyOn(FigureBody.prototype, 'moment')
    const view = render(
      <LooseFigure mode="rest" at={at([300, 200])} doing="thinking" waiting={2} />,
    )
    time.wait(400)
    expect(performed).toHaveBeenLastCalledWith('thinking')
    expect(waiting).toHaveBeenLastCalledWith(2)
    view.rerender(
      <LooseFigure
        mode="rest"
        at={at([300, 200])}
        doing="thinking"
        waiting={2}
        moment={{ kind: 'received', serial: 4 }}
      />,
    )
    expect(moment).toHaveBeenCalledWith('received')
    expect(document.querySelector('.omne-figure-carried [data-figure-ink]')).not.toBeNull()
  })

  it('in the hand it keeps writing its state', () => {
    const time = frameClock()
    const performed = vi.spyOn(FigureBody.prototype, 'perform')
    const view = render(<LooseFigure mode="hand" at={at([300, 200])} />)
    time.wait(20)
    view.rerender(<LooseFigure mode="hand" at={at([310, 200])} doing="writing" />)
    time.wait(2000)
    expect(performed).toHaveBeenLastCalledWith('writing')
  })

  it('a moment told before it was drawn is not written again', () => {
    const time = frameClock()
    const moment = vi.spyOn(FigureBody.prototype, 'moment')
    render(<LooseFigure mode="rest" at={at([300, 200])} moment={{ kind: 'received', serial: 3 }} />)
    time.wait(20)
    expect(moment).not.toHaveBeenCalled()
  })

  it('draws its own body: another hand for the figure key is not asked', () => {
    const time = frameClock()
    const redraw: Redraw = (_kind, key, _subject, builtIn) =>
      key === 'figure' ? <b data-mascot="" /> : builtIn()
    render(
      <RedrawProvider value={redraw}>
        <LooseFigure mode="rest" at={at([300, 200])} />
      </RedrawProvider>,
    )
    time.wait(20)
    expect(document.querySelector('[data-mascot]')).toBeNull()
    expect(document.querySelector('[data-figure-ink]')).not.toBeNull()
  })

  it('keeps the paper breath round its ink, the same rule as on the page, so it shows on a dark window', () => {
    render(<LooseFigure mode="rest" at={at([300, 200])} />)
    expect(document.querySelector('.omne-figure-carried [data-figure-ink]')).not.toBeNull()
    const rules = STYLES.split('}')
    const breath = rules.find(text => text.includes('.omne-figure-carried .omne-figure-ink'))
    expect(breath).toMatch(/filter:\s*drop-shadow/)
    expect(rules.some(text => /filter:\s*none/.test(text))).toBe(false)
  })
})

describe('at most one on a surface (FE-I65)', () => {
  it('a second loose figure draws nothing', () => {
    const time = frameClock()
    const said = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(
      <>
        <LooseFigure mode="rest" at={at([300, 200])} />
        <LooseFigure mode="rest" at={at([500, 200])} />
      </>,
    )
    time.wait(20)
    expect(document.querySelectorAll('.omne-figure-carried')).toHaveLength(1)
    expect(where()).toEqual([300, 200])
    expect(said).toHaveBeenCalled()
  })

  it('a loose figure and a figure stage on one page: only one of them draws', () => {
    const time = frameClock()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(
      <>
        <FigureStage label="形">
          <FigureSeat name="home" />
        </FigureStage>
        <LooseFigure mode="rest" at={at([500, 200])} />
      </>,
    )
    time.wait(20)
    expect(document.querySelectorAll('.omne-figure-layer')).toHaveLength(1)
  })
})

describe('it takes the pointer itself', () => {
  function hands(): Required<
    Pick<
      Props,
      'onDown' | 'onLift' | 'onMove' | 'onDrop' | 'onCancel' | 'onClick' | 'onDoubleClick'
    >
  > {
    return {
      onDown: vi.fn(),
      onLift: vi.fn(),
      onMove: vi.fn(),
      onDrop: vi.fn(),
      onCancel: vi.fn(),
      onClick: vi.fn(),
      onDoubleClick: vi.fn(),
    }
  }

  it('tells the press, the lift past 4px, a move at most once a frame and the drop, with where the pointer is', () => {
    const time = frameClock()
    const told = hands()
    render(<LooseFigure mode="rest" at={at([300, 200])} {...told} />)
    time.wait(20)
    press([300, 200], 'down')
    expect(told.onDown).toHaveBeenCalledWith(
      expect.objectContaining({ client: { x: 300, y: 200 }, screen: { x: 300, y: 200 } }),
    )
    press([303, 200], 'move')
    expect(told.onLift).not.toHaveBeenCalled()
    press([306, 200], 'move')
    expect(told.onLift).toHaveBeenCalledTimes(1)
    press([320, 200], 'move')
    press([330, 210], 'move')
    expect(told.onMove).not.toHaveBeenCalled()
    time.wait(1)
    expect(told.onMove).toHaveBeenCalledTimes(1)
    expect(told.onMove).toHaveBeenLastCalledWith(
      expect.objectContaining({ client: { x: 330, y: 210 } }),
    )
    press([340, 210], 'up')
    expect(told.onDrop).toHaveBeenCalledTimes(1)
    expect(told.onDrop).toHaveBeenLastCalledWith(
      expect.objectContaining({ client: { x: 340, y: 210 } }),
    )
    time.wait(1000)
    expect(told.onClick).not.toHaveBeenCalled()
    expect(told.onCancel).not.toHaveBeenCalled()
  })

  it('a pointer cancelled in the hand is told as a cancel', () => {
    const time = frameClock()
    const told = hands()
    render(<LooseFigure mode="rest" at={at([300, 200])} {...told} />)
    time.wait(20)
    press([300, 200], 'down')
    press([320, 200], 'move')
    act(() => {
      fireEvent.pointerCancel(reachable()!, { pointerId: 1 })
    })
    expect(told.onCancel).toHaveBeenCalledTimes(1)
    expect(told.onDrop).not.toHaveBeenCalled()
  })

  it('a click is told only once 320ms have passed without a second', () => {
    const time = frameClock()
    const told = hands()
    render(<LooseFigure mode="rest" at={at([300, 200])} {...told} />)
    time.wait(20)
    click([300, 200])
    time.wait(319)
    expect(told.onClick).not.toHaveBeenCalled()
    time.wait(1)
    expect(told.onClick).toHaveBeenCalledTimes(1)
    expect(told.onDoubleClick).not.toHaveBeenCalled()
    expect(told.onLift).not.toHaveBeenCalled()
  })

  it('a double click is told only as a double click', () => {
    const time = frameClock()
    const told = hands()
    render(<LooseFigure mode="rest" at={at([300, 200])} {...told} />)
    time.wait(20)
    click([300, 200])
    time.wait(150)
    click([301, 200])
    expect(told.onDoubleClick).toHaveBeenCalledTimes(1)
    time.wait(1000)
    expect(told.onClick).not.toHaveBeenCalled()
    expect(told.onDoubleClick).toHaveBeenCalledTimes(1)
  })

  it('taken up within the wait after a click, the click is not told', () => {
    const time = frameClock()
    const told = hands()
    render(<LooseFigure mode="rest" at={at([300, 200])} {...told} />)
    time.wait(20)
    click([300, 200])
    time.wait(100)
    press([300, 200], 'down')
    press([320, 200], 'move')
    time.wait(1000)
    expect(told.onLift).toHaveBeenCalledTimes(1)
    expect(told.onClick).not.toHaveBeenCalled()
    expect(told.onDoubleClick).not.toHaveBeenCalled()
  })

  it('in hand with the pointer on it, it follows the pointer itself and not the points it is given', () => {
    const time = frameClock()
    const view = render(<LooseFigure mode="rest" at={at([300, 200])} />)
    time.wait(20)
    press([300, 200], 'down')
    press([310, 200], 'move')
    view.rerender(<LooseFigure mode="hand" at={at([310, 200])} />)
    expect(where()).toEqual([310, 200])
    press([400, 250], 'move')
    time.wait(10)
    view.rerender(<LooseFigure mode="hand" at={at([330, 210])} />)
    time.wait(400)
    expect(where()).toEqual([400, 250])
  })

  it('before the hand mode comes, the lifted figure stays where it rests', () => {
    const time = frameClock()
    render(<LooseFigure mode="rest" at={at([300, 200])} />)
    time.wait(20)
    press([300, 200], 'down')
    press([400, 260], 'move')
    time.wait(400)
    expect(where()).toEqual([300, 200])
  })
})

describe('reduced motion', () => {
  it('home is there at once and has arrived; rest is there at once', () => {
    const time = frameClock()
    const arrived = vi.fn()
    const view = render(<LooseFigure mode="hand" at={at([600, 400])} reduced onArrived={arrived} />)
    time.wait(20)
    view.rerender(<LooseFigure mode="rest" at={at([500, 300])} reduced onArrived={arrived} />)
    expect(where()).toEqual([500, 300])
    view.rerender(<LooseFigure mode="home" at={at([80, 60])} reduced onArrived={arrived} />)
    expect(arrived).toHaveBeenCalledTimes(1)
    expect(where()).toEqual([80, 60])
    expect(remnants()).toBe(0)
  })

  it('in the hand it is under the given point at once', () => {
    const time = frameClock()
    const view = render(<LooseFigure mode="hand" at={at([100, 200])} reduced />)
    time.wait(20)
    view.rerender(<LooseFigure mode="hand" at={at([400, 200])} reduced />)
    expect(where()).toEqual([400, 200])
  })
})

describe('home with the mark to rewrite first (C14)', () => {
  const REWRITE = 520

  it('the circle is first written again over its own trace where it is, then the stroke goes home', () => {
    const time = frameClock()
    const arrived = vi.fn()
    const rewritten = vi.spyOn(FigureBody.prototype, 'rewrite')
    const view = render(<LooseFigure mode="rest" at={at([600, 400])} onArrived={arrived} />)
    time.wait(700)
    const before = rewritten.mock.calls.length
    view.rerender(<LooseFigure mode="home" at={at([80, 60])} rewriteFirst onArrived={arrived} />)
    expect(rewritten.mock.calls.length).toBe(before + 1)
    expect(rewritten).toHaveBeenLastCalledWith(REWRITE)
    time.wait(REWRITE - 20)
    expect(remnants()).toBe(0)
    expect(where()).toEqual([600, 400])
    time.wait(70)
    expect(remnants()).toBeGreaterThan(0)
    time.wait(3000)
    expect(arrived).toHaveBeenCalledTimes(1)
    expect(where()).toEqual([80, 60])
  })

  it('without the mark the stroke goes at once and nothing is rewritten', () => {
    const time = frameClock()
    const rewritten = vi.spyOn(FigureBody.prototype, 'rewrite')
    const view = render(<LooseFigure mode="rest" at={at([600, 400])} />)
    time.wait(700)
    const before = rewritten.mock.calls.length
    view.rerender(<LooseFigure mode="home" at={at([80, 60])} />)
    time.wait(50)
    expect(remnants()).toBeGreaterThan(0)
    expect(rewritten.mock.calls.length).toBe(before)
  })

  it('taken into the hand while it rewrites, it never goes home', () => {
    const time = frameClock()
    const arrived = vi.fn()
    const view = render(<LooseFigure mode="rest" at={at([600, 400])} onArrived={arrived} />)
    time.wait(700)
    view.rerender(<LooseFigure mode="home" at={at([80, 60])} rewriteFirst onArrived={arrived} />)
    time.wait(200)
    view.rerender(<LooseFigure mode="hand" at={at([500, 300])} onArrived={arrived} />)
    time.wait(3000)
    expect(remnants()).toBe(0)
    expect(where()).toEqual([500, 300])
    expect(arrived).not.toHaveBeenCalled()
  })

  it('taken away while it rewrites, nothing is drawn and it never arrives', () => {
    const time = frameClock()
    const arrived = vi.fn()
    const view = render(<LooseFigure mode="rest" at={at([600, 400])} onArrived={arrived} />)
    time.wait(700)
    view.rerender(<LooseFigure mode="home" at={at([80, 60])} rewriteFirst onArrived={arrived} />)
    time.wait(200)
    view.rerender(<LooseFigure mode="none" onArrived={arrived} />)
    time.wait(3000)
    expect(carried()).toBeNull()
    expect(arrived).not.toHaveBeenCalled()
  })

  it('a new home point while it rewrites is where the stroke goes', () => {
    const time = frameClock()
    const arrived = vi.fn()
    const view = render(<LooseFigure mode="rest" at={at([600, 400])} onArrived={arrived} />)
    time.wait(700)
    view.rerender(<LooseFigure mode="home" at={at([80, 60])} rewriteFirst onArrived={arrived} />)
    time.wait(200)
    view.rerender(<LooseFigure mode="home" at={at([120, 90])} rewriteFirst onArrived={arrived} />)
    time.wait(3500)
    expect(arrived).toHaveBeenCalledTimes(1)
    expect(where()).toEqual([120, 90])
  })

  it('under reduced motion it is home at once, with nothing rewritten', () => {
    const time = frameClock()
    const arrived = vi.fn()
    const rewritten = vi.spyOn(FigureBody.prototype, 'rewrite')
    const view = render(<LooseFigure mode="rest" at={at([600, 400])} reduced onArrived={arrived} />)
    time.wait(20)
    const before = rewritten.mock.calls.length
    view.rerender(
      <LooseFigure mode="home" at={at([80, 60])} rewriteFirst reduced onArrived={arrived} />,
    )
    expect(arrived).toHaveBeenCalledTimes(1)
    expect(where()).toEqual([80, 60])
    expect(rewritten.mock.calls.length).toBe(before)
  })
})
