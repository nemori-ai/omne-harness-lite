// @vitest-environment happy-dom
import { cleanup, createEvent, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  AppTooltipProvider,
  PAPER_NAME_LINE,
  type PaperBox,
  PaperPage,
  PaperPile,
  type PaperPoint,
  PaperSpot,
  PaperSurface,
  type PaperView,
  type PlaceBox,
  usePaperAt,
} from '../src/index.ts'

const SHEET = { width: 2000, height: 1600, step: 16 }
const LIMITS = { minWidth: 64, minHeight: 64, maxWidth: 800, maxHeight: 800 }
const ZOOM = { min: 0.5, max: 2 }
const CENTRE: PaperView = { x: 1000, y: 800, zoom: 1 }
const BOX: PaperBox = { x: 96, y: 96, width: 320, height: 240 }

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  document.documentElement.style.removeProperty('--omne-size')
  delete document.documentElement.dataset['theme']
})

function Board({
  view = CENTRE,
  onViewChange = () => undefined,
  magnet = false,
  onDropAt,
  children,
}: {
  readonly view?: PaperView
  readonly onViewChange?: (view: PaperView) => void
  readonly magnet?: boolean
  readonly onDropAt?: (event: React.DragEvent<HTMLDivElement>, at: PaperPoint) => void
  readonly children?: React.ReactNode
}): React.JSX.Element {
  return (
    <AppTooltipProvider>
      <PaperSurface
        label="画布"
        sheet={SHEET}
        view={view}
        onViewChange={onViewChange}
        zoomLimits={ZOOM}
        limits={LIMITS}
        magnet={magnet}
        {...(onDropAt === undefined ? {} : { onDropAt })}
      >
        {children}
      </PaperSurface>
    </AppTooltipProvider>
  )
}

function placed(name: string): PaperBox {
  const page = screen.getByRole('group', { name })
  const read = (property: string): number => Number(page.style.getPropertyValue(property))
  return {
    x: read('--omne-paper-x'),
    y: read('--omne-paper-y'),
    width: read('--omne-paper-w'),
    height: read('--omne-paper-h'),
  }
}

function drag(element: Element, from: [number, number], to: [number, number]): void {
  fireEvent.pointerDown(element, { pointerId: 1, button: 0, clientX: from[0], clientY: from[1] })
  fireEvent.pointerMove(element, { pointerId: 1, clientX: to[0], clientY: to[1] })
}

function release(element: Element, at: [number, number]): void {
  fireEvent.pointerUp(element, { pointerId: 1, clientX: at[0], clientY: at[1] })
}

function wheel(
  target: Element,
  init: { deltaX?: number; deltaY: number; ctrlKey?: boolean; metaKey?: boolean },
): void {
  const event = new WheelEvent('wheel', {
    deltaX: init.deltaX ?? 0,
    deltaY: init.deltaY,
    bubbles: true,
    cancelable: true,
  })
  Object.defineProperty(event, 'ctrlKey', { value: init.ctrlKey === true })
  Object.defineProperty(event, 'metaKey', { value: init.metaKey === true })
  target.dispatchEvent(event)
}

function corner(name: string, which: string): Element {
  const found = screen.getByRole('group', { name }).querySelector(`[data-corner="${which}"]`)
  if (found === null) throw new Error(`no ${which} corner`)
  return found
}

describe('a page', () => {
  it('follows the pointer only as a preview and hands the landing over once, on release', () => {
    const onPlace = vi.fn<PlaceBox>()
    render(
      <Board>
        <PaperPage box={BOX} name="报告" onPlace={onPlace}>
          正文
        </PaperPage>
      </Board>,
    )
    const handle = screen.getByRole('button', { name: '挪动报告' })
    drag(handle, [100, 100], [140, 124])
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 157, clientY: 131 })
    expect(onPlace).not.toHaveBeenCalled()
    expect(placed('报告')).toEqual({ ...BOX, x: 153, y: 127 })
    release(handle, [157, 131])
    expect(onPlace).toHaveBeenCalledTimes(1)
    expect(onPlace).toHaveBeenCalledWith({ ...BOX, x: 153, y: 127 }, 'move')
    expect(placed('报告')).toEqual(BOX)
  })

  it('is drawn where the caller puts it after the release, and nowhere else', () => {
    function Holder(): React.JSX.Element {
      const [box, setBox] = useState(BOX)
      return (
        <Board magnet>
          <PaperPage box={box} name="报告" onPlace={next => setBox({ ...next, x: next.x + 1 })} />
        </Board>
      )
    }
    render(<Holder />)
    const handle = screen.getByRole('button', { name: '挪动报告' })
    drag(handle, [0, 0], [41, 27])
    expect(placed('报告')).toEqual({ ...BOX, x: 144, y: 128 })
    release(handle, [41, 27])
    expect(placed('报告')).toEqual({ ...BOX, x: 145, y: 128 })
  })

  it('converts the pointer by the zoom and the size step, and stops at the edge of the paper', () => {
    document.documentElement.style.setProperty('--omne-size', '1.5')
    const onPlace = vi.fn<PlaceBox>()
    render(
      <Board view={{ ...CENTRE, zoom: 2 }}>
        <PaperPage box={BOX} name="报告" onPlace={onPlace} />
      </Board>,
    )
    const handle = screen.getByRole('button', { name: '挪动报告' })
    drag(handle, [0, 0], [60, -30])
    expect(placed('报告')).toEqual({ ...BOX, x: 116, y: 86 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 99_999, clientY: -99_999 })
    release(handle, [99_999, -99_999])
    expect(onPlace).toHaveBeenCalledWith({ ...BOX, x: SHEET.width - BOX.width, y: 0 }, 'move')
  })

  it('resizes from a corner as a preview and hands the box over once, inside the limits', () => {
    const onPlace = vi.fn<PlaceBox>()
    render(
      <Board>
        <PaperPage box={BOX} name="报告" onPlace={onPlace} />
      </Board>,
    )
    const grip = corner('报告', 'nw')
    drag(grip, [0, 0], [30, -20])
    expect(onPlace).not.toHaveBeenCalled()
    expect(placed('报告')).toEqual({ x: 126, y: 76, width: 290, height: 260 })
    fireEvent.pointerMove(grip, { pointerId: 1, clientX: 5000, clientY: 0 })
    release(grip, [5000, 0])
    expect(onPlace).toHaveBeenCalledTimes(1)
    expect(onPlace).toHaveBeenCalledWith(
      { x: BOX.x + BOX.width - LIMITS.minWidth, y: 96, width: LIMITS.minWidth, height: 240 },
      'resize',
    )
    expect(placed('报告')).toEqual(BOX)
  })

  it('hands nothing over when the pointer barely moves or the gesture is called off', () => {
    const onPlace = vi.fn<PlaceBox>()
    const onPress = vi.fn()
    render(
      <Board>
        <PaperPage box={BOX} name="报告" onPlace={onPlace} onPress={onPress} />
      </Board>,
    )
    const handle = screen.getByRole('button', { name: '挪动报告' })
    drag(handle, [0, 0], [2, 2])
    release(handle, [2, 2])
    expect(onPress).toHaveBeenCalledTimes(1)
    drag(handle, [0, 0], [80, 80])
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(placed('报告')).toEqual(BOX)
    release(handle, [80, 80])
    drag(corner('报告', 'se'), [0, 0], [80, 80])
    fireEvent.pointerCancel(corner('报告', 'se'), { pointerId: 1 })
    release(corner('报告', 'se'), [80, 80])
    expect(onPlace).not.toHaveBeenCalled()
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('moves and resizes from the keyboard by one grid step a press, each press handed over', () => {
    const onPlace = vi.fn<PlaceBox>()
    const onPress = vi.fn()
    const page = { ...BOX, height: 240 + PAPER_NAME_LINE }
    render(
      <Board magnet>
        <PaperPage box={page} name="报告" onPlace={onPlace} onPress={onPress} />
      </Board>,
    )
    const handle = screen.getByRole('button', { name: '挪动报告' })
    handle.focus()
    expect(document.activeElement).toBe(handle)
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    fireEvent.keyDown(handle, { key: 'ArrowUp' })
    fireEvent.keyDown(handle, { key: 'ArrowDown', shiftKey: true })
    fireEvent.keyDown(handle, { key: 'ArrowLeft', shiftKey: true })
    fireEvent.keyDown(handle, { key: 'Enter' })
    expect(onPlace.mock.calls).toEqual([
      [{ ...page, x: 112 }, 'move'],
      [{ ...page, y: 80 }, 'move'],
      [{ ...page, height: 256 + PAPER_NAME_LINE }, 'resize'],
      [{ ...page, width: 304 }, 'resize'],
    ])
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('moves and resizes by one unit with Alt, off the grid only while the magnet is off', () => {
    const loose = vi.fn<PlaceBox>()
    const { unmount } = render(
      <Board>
        <PaperPage box={BOX} name="报告" onPlace={loose} />
      </Board>,
    )
    const handle = screen.getByRole('button', { name: '挪动报告' })
    fireEvent.keyDown(handle, { key: 'ArrowRight', altKey: true })
    fireEvent.keyDown(handle, { key: 'ArrowDown', altKey: true, shiftKey: true })
    expect(loose.mock.calls).toEqual([
      [{ ...BOX, x: 97 }, 'move'],
      [{ ...BOX, height: 241 }, 'resize'],
    ])
    expect(handle.getAttribute('aria-keyshortcuts')).toContain('Alt+ArrowRight')
    unmount()
    const snapped = vi.fn<PlaceBox>()
    render(
      <Board magnet>
        <PaperPage box={BOX} name="报告" onPlace={snapped} />
      </Board>,
    )
    fireEvent.keyDown(screen.getByRole('button', { name: '挪动报告' }), {
      key: 'ArrowRight',
      altKey: true,
    })
    expect(snapped).not.toHaveBeenCalled()
  })

  it('hands nothing over from the keyboard at the edge of the paper', () => {
    const onPlace = vi.fn<PlaceBox>()
    render(
      <Board>
        <PaperPage box={{ ...BOX, x: 0 }} name="报告" onPlace={onPlace} />
      </Board>,
    )
    fireEvent.keyDown(screen.getByRole('button', { name: '挪动报告' }), { key: 'ArrowLeft' })
    expect(onPlace).not.toHaveBeenCalled()
  })

  it('has no handle when locked: no drag, no corners, no keyboard move', () => {
    const onPlace = vi.fn<PlaceBox>()
    render(
      <Board>
        <PaperPage box={BOX} name="报告" onPlace={onPlace} locked aside={<span>锁</span>}>
          正文
        </PaperPage>
      </Board>,
    )
    const page = screen.getByRole('group', { name: '报告' })
    expect(within(page).queryByRole('button')).toBeNull()
    expect(page.querySelector('[data-corner]')).toBeNull()
    expect(page.dataset['locked']).toBe('true')
    expect(within(page).getByText('锁')).toBeTruthy()
    fireEvent.keyDown(within(page).getByText('报告'), { key: 'ArrowRight' })
    drag(within(page).getByText('报告'), [0, 0], [80, 80])
    release(within(page).getByText('报告'), [80, 80])
    expect(onPlace).not.toHaveBeenCalled()
    expect(placed('报告')).toEqual(BOX)
  })

  it('shows the caller that it is not settled yet and that it is selected', () => {
    render(
      <Board>
        <PaperPage box={BOX} name="甲" onPlace={() => undefined} pending />
        <PaperPage box={BOX} name="乙" onPlace={() => undefined} selected />
      </Board>,
    )
    expect(screen.getByRole('group', { name: '甲' }).getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('group', { name: '甲' }).dataset['selected']).toBeUndefined()
    expect(screen.getByRole('group', { name: '乙' }).getAttribute('aria-busy')).toBeNull()
    expect(screen.getByRole('group', { name: '乙' }).dataset['selected']).toBe('true')
  })

  it('is drawn only inside a paper surface', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => render(<PaperPage box={BOX} name="报告" onPlace={() => undefined} />)).toThrow(
      /PaperSurface/,
    )
  })
})

describe('the surface', () => {
  function lens(): HTMLElement {
    const found = screen.getByRole('region', { name: '画布' }).querySelector('.omne-paper-lens')
    if (!(found instanceof HTMLElement)) throw new Error('no lens')
    return found
  }

  it('hands pan and zoom from the keyboard over and keeps no view of its own', () => {
    const onViewChange = vi.fn<(view: PaperView) => void>()
    render(<Board onViewChange={onViewChange} />)
    const surface = screen.getByRole('region', { name: '画布' })
    surface.focus()
    expect(document.activeElement).toBe(surface)
    fireEvent.keyDown(surface, { key: 'ArrowRight' })
    fireEvent.keyDown(surface, { key: 'ArrowRight' })
    fireEvent.keyDown(surface, { key: 'ArrowUp', shiftKey: true })
    fireEvent.keyDown(surface, { key: '+' })
    fireEvent.keyDown(surface, { key: '-' })
    fireEvent.keyDown(surface, { key: '0' })
    expect(onViewChange.mock.calls.map(([view]) => view)).toEqual([
      { x: 1064, y: 800, zoom: 1 },
      { x: 1064, y: 800, zoom: 1 },
      { x: 1000, y: 544, zoom: 1 },
      { x: 1000, y: 800, zoom: 1.25 },
      { x: 1000, y: 800, zoom: 0.8 },
    ])
    expect(lens().style.getPropertyValue('--omne-paper-at-x')).toBe('1000')
  })

  it('pans with the pointer on bare paper only, and stops at the edge', () => {
    const onViewChange = vi.fn<(view: PaperView) => void>()
    render(
      <Board onViewChange={onViewChange}>
        <PaperPage box={BOX} name="报告" onPlace={() => undefined}>
          正文
        </PaperPage>
      </Board>,
    )
    const surface = screen.getByRole('region', { name: '画布' })
    drag(screen.getByText('正文'), [0, 0], [50, 50])
    expect(onViewChange).not.toHaveBeenCalled()
    release(screen.getByText('正文'), [50, 50])
    drag(surface, [0, 0], [-30, -20])
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 5000, clientY: 0 })
    release(surface, [5000, 0])
    expect(onViewChange.mock.calls.map(([view]) => view)).toEqual([
      { x: 1030, y: 820, zoom: 1 },
      { x: 0, y: 800, zoom: 1 },
    ])
  })

  it('zooms with a pinch or a held command key inside the limits, and pans with the wheel', () => {
    const onViewChange = vi.fn<(view: PaperView) => void>()
    render(<Board onViewChange={onViewChange} />)
    const surface = screen.getByRole('region', { name: '画布' })
    wheel(surface, { deltaY: 500, ctrlKey: true })
    wheel(surface, { deltaY: -100, metaKey: true })
    wheel(surface, { deltaX: 12, deltaY: 30 })
    const [pinched, held, wheeled] = onViewChange.mock.calls.map(([view]) => view)
    expect(pinched?.zoom).toBe(ZOOM.min)
    expect(held?.zoom).toBeCloseTo(Math.exp(0.2), 9)
    expect(wheeled).toEqual({ x: 1012, y: 830, zoom: 1 })
  })

  it('draws the view it is given clamped to the paper and the zoom limits', () => {
    render(<Board view={{ x: -500, y: 99_999, zoom: 40 }} />)
    expect(lens().style.getPropertyValue('--omne-paper-at-x')).toBe('0')
    expect(lens().style.getPropertyValue('--omne-paper-at-y')).toBe(String(SHEET.height))
    expect(lens().style.getPropertyValue('--omne-paper-zoom')).toBe('2')
  })
})

describe('a pile', () => {
  const LEAVES = ['一', '二', '三', '四', '五', '六'].map(name => ({
    key: name,
    name: `第${name}页`,
    content: <p>{`${name}的正文`}</p>,
  }))

  function Pile({
    open = false,
    onOpenChange = () => undefined,
    onPlace = () => undefined,
  }: {
    readonly open?: boolean
    readonly onOpenChange?: (open: boolean) => void
    readonly onPlace?: PlaceBox
  }): React.JSX.Element {
    return (
      <Board>
        <PaperPile
          box={BOX}
          name="资料"
          leaves={LEAVES}
          open={open}
          onOpenChange={onOpenChange}
          onPlace={onPlace}
        />
      </Board>
    )
  }

  it('shows the top page whole and the edges of at most three under it when closed', () => {
    const onOpenChange = vi.fn()
    render(<Pile onOpenChange={onOpenChange} />)
    const pile = screen.getByRole('group', { name: '资料' })
    expect(pile.dataset['state']).toBe('closed')
    expect(
      within(pile)
        .getAllByRole('group')
        .map(leaf => leaf.getAttribute('aria-label')),
    ).toEqual(['第一页'])
    const drawn = [...pile.querySelectorAll<HTMLElement>('.omne-paper-pile-leaf')]
    expect(drawn.map(leaf => leaf.dataset['depth'])).toEqual(['3', '2', '1', '0'])
    expect(drawn.slice(0, 3).every(leaf => leaf.inert)).toBe(true)
    expect(within(pile).getByText('6')).toBeTruthy()
    fireEvent.click(within(pile).getByRole('button', { name: '展开' }))
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it('lays every page out when open, and closes with Escape', () => {
    const onOpenChange = vi.fn()
    render(<Pile open onOpenChange={onOpenChange} />)
    const pile = screen.getByRole('group', { name: '资料' })
    expect(pile.dataset['state']).toBe('open')
    expect(
      within(pile)
        .getAllByRole('group')
        .map(leaf => leaf.getAttribute('aria-label')),
    ).toEqual(LEAVES.map(leaf => leaf.name))
    const toggle = within(pile).getByRole('button', { name: '收起' })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    fireEvent.keyDown(within(pile).getByText('三的正文'), { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('is dragged whole by its name, like a page, and cannot be resized', () => {
    const onPlace = vi.fn<PlaceBox>()
    render(<Pile onPlace={onPlace} />)
    const handle = screen.getByRole('button', { name: '挪动资料' })
    drag(handle, [0, 0], [20, 20])
    expect(onPlace).not.toHaveBeenCalled()
    release(handle, [20, 20])
    fireEvent.keyDown(handle, { key: 'ArrowRight', shiftKey: true })
    fireEvent.keyDown(handle, { key: 'ArrowDown' })
    expect(onPlace.mock.calls).toEqual([
      [{ ...BOX, x: 116, y: 116 }, 'move'],
      [{ ...BOX, y: 112 }, 'move'],
    ])
    expect(screen.getByRole('group', { name: '资料' }).querySelector('[data-corner]')).toBeNull()
  })

  it('names a pile without a name for the caller', () => {
    render(
      <Board>
        <PaperPile
          box={BOX}
          leaves={LEAVES.slice(0, 1)}
          open={false}
          onOpenChange={() => undefined}
          onPlace={() => undefined}
          unnamedLabel="一叠"
        />
      </Board>,
    )
    expect(screen.getByRole('button', { name: '挪动一叠' })).toBeTruthy()
  })
})

it.each(['light', 'dark'] as const)(
  'the surface, a page and a pile keep their roles and names under the %s theme',
  theme => {
    document.documentElement.dataset['theme'] = theme
    render(
      <Board magnet>
        <PaperPage box={BOX} name="报告" onPlace={() => undefined} />
        <PaperPile
          box={{ ...BOX, x: 800 }}
          name="资料"
          leaves={[{ key: 'a', name: '甲', content: '甲的正文' }]}
          open={false}
          onOpenChange={() => undefined}
          onPlace={() => undefined}
        />
      </Board>,
    )
    expect(document.documentElement.dataset['theme']).toBe(theme)
    const surface = screen.getByRole('region', { name: '画布' })
    expect(surface.getAttribute('aria-roledescription')).toBe('纸面')
    expect(screen.getByRole('group', { name: '报告' }).getAttribute('aria-roledescription')).toBe(
      '页',
    )
    expect(screen.getByRole('group', { name: '资料' }).getAttribute('aria-roledescription')).toBe(
      '一叠',
    )
    for (const name of ['挪动报告', '挪动资料'])
      expect(screen.getByRole('button', { name }).getAttribute('aria-roledescription')).toBe('把手')
    const order = [...surface.querySelectorAll<HTMLElement>('[tabindex="0"], button')].map(
      element => element.getAttribute('aria-label'),
    )
    expect(order).toEqual(['挪动报告', '挪动资料', '展开'])
  },
)

describe('a spot', () => {
  it('draws what it holds at a point of the paper, and is no page: no handle, no corners, nothing to drag', () => {
    render(
      <Board>
        <PaperSpot at={{ x: 120, y: 80 }}>
          <span>座位</span>
        </PaperSpot>
      </Board>,
    )
    const spot = screen.getByText('座位').closest<HTMLElement>('[data-slot="paper-spot"]')
    expect(spot?.style.getPropertyValue('--omne-paper-x')).toBe('120')
    expect(spot?.style.getPropertyValue('--omne-paper-y')).toBe('80')
    expect(screen.queryByRole('group')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(spot?.querySelector('[data-corner]')).toBeNull()
  })

  it('does not pan the paper when pressed', () => {
    const onViewChange = vi.fn<(view: PaperView) => void>()
    render(
      <Board onViewChange={onViewChange}>
        <PaperSpot at={{ x: 120, y: 80 }}>座位</PaperSpot>
      </Board>,
    )
    drag(screen.getByText('座位'), [0, 0], [50, 50])
    release(screen.getByText('座位'), [50, 50])
    expect(onViewChange).not.toHaveBeenCalled()
  })

  it('is drawn only inside a paper surface', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => render(<PaperSpot at={{ x: 0, y: 0 }} />)).toThrow()
  })
})

describe('a point of the screen on the paper', () => {
  function seen(left: number, top: number, width: number, height: number): void {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(height)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left,
      top,
      width,
      height,
      x: left,
      y: top,
      right: left + width,
      bottom: top + height,
      toJSON: () => ({}),
    } as DOMRect)
  }

  function asked(view: PaperView, points: readonly PaperPoint[]): PaperPoint[] {
    let at: ((client: PaperPoint) => PaperPoint) | undefined
    function Asker(): null {
      at = usePaperAt()
      return null
    }
    render(
      <Board view={view}>
        <Asker />
      </Board>,
    )
    return points.map(point => at!(point))
  }

  it('is the paper under it, by the view, the zoom and the size step, in whole units', () => {
    seen(100, 50, 800, 600)
    expect(
      asked(CENTRE, [
        { x: 500, y: 350 },
        { x: 110.4, y: 60.6 },
      ]),
    ).toEqual([
      { x: 1000, y: 800 },
      { x: 610, y: 511 },
    ])
    cleanup()
    document.documentElement.style.setProperty('--omne-size', '1.5')
    expect(asked({ ...CENTRE, zoom: 2 }, [{ x: 530, y: 320 }])).toEqual([{ x: 1010, y: 790 }])
  })

  it('stays on the paper when the screen point is off it', () => {
    seen(0, 0, 800, 600)
    expect(
      asked(CENTRE, [
        { x: -99_999, y: 99_999 },
        { x: 99_999, y: -99_999 },
      ]),
    ).toEqual([
      { x: 0, y: SHEET.height },
      { x: SHEET.width, y: 0 },
    ])
  })

  it('comes with something dropped on the paper, and the drop is taken', () => {
    seen(100, 50, 800, 600)
    const onDropAt = vi.fn<(event: React.DragEvent<HTMLDivElement>, at: PaperPoint) => void>()
    render(<Board onDropAt={onDropAt} />)
    const surface = screen.getByRole('region', { name: '画布' })
    const dropped = (type: 'dragOver' | 'drop'): Event => {
      const event = createEvent[type](surface)
      Object.defineProperties(event, { clientX: { value: 500 }, clientY: { value: 350 } })
      return event
    }
    expect(fireEvent(surface, dropped('dragOver'))).toBe(false)
    expect(fireEvent(surface, dropped('drop'))).toBe(false)
    expect(onDropAt).toHaveBeenCalledTimes(1)
    expect(onDropAt.mock.calls[0]?.[1]).toEqual({ x: 1000, y: 800 })
  })

  it('lands a drop on the grid while the magnet is on', () => {
    seen(100, 50, 800, 600)
    const onDropAt = vi.fn<(event: React.DragEvent<HTMLDivElement>, at: PaperPoint) => void>()
    render(<Board magnet onDropAt={onDropAt} />)
    const surface = screen.getByRole('region', { name: '画布' })
    const event = createEvent.drop(surface)
    Object.defineProperties(event, { clientX: { value: 110.4 }, clientY: { value: 60.6 } })
    fireEvent(surface, event)
    expect(onDropAt.mock.calls[0]?.[1]).toEqual({ x: 608, y: 512 })
  })

  it('leaves a drop alone when the caller takes none', () => {
    render(<Board />)
    const surface = screen.getByRole('region', { name: '画布' })
    expect(fireEvent.dragOver(surface)).toBe(true)
    expect(fireEvent.drop(surface)).toBe(true)
  })
})
