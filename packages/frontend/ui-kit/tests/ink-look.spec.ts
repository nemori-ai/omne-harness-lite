// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FIGURE_SIZE, InkBubble, inkLookChanged } from '../src/index.ts'
import { InkCanvas, type InkFrame } from '../src/ink/ink-canvas.ts'
import { bubbleStrokes, unitOf } from '../src/ink/note-ink.ts'
import { type Box } from '../src/ink/travel.ts'

const WASHED: InkFrame = { marks: [], wash: 1 }
const BEFORE = 'rgb(10, 20, 30)'
const AFTER = 'rgb(40, 50, 60)'

function recordingContext(fills: string[]): CanvasRenderingContext2D {
  let fill: unknown = null
  const context = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    get fillStyle(): unknown {
      return fill
    },
    set fillStyle(value: unknown) {
      fill = value
      if (typeof value === 'string') fills.push(value)
    },
    setTransform: () => undefined,
    clearRect: () => undefined,
    fillRect: () => undefined,
    drawImage: () => undefined,
    createRadialGradient: () => ({ addColorStop: () => undefined }),
  }
  return context as unknown as CanvasRenderingContext2D
}

interface Drawn {
  readonly ink: InkCanvas
  readonly paper: HTMLElement
  readonly fills: string[]
}

function drawn(): Drawn {
  const fills: string[] = []
  vi.stubGlobal('OffscreenCanvas', undefined)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => recordingContext(fills) as never,
  )
  const paper = document.createElement('div')
  paper.style.color = BEFORE
  const canvas = document.createElement('canvas')
  paper.append(canvas)
  document.body.append(paper)
  return { ink: new InkCanvas(canvas, FIGURE_SIZE), paper, fills }
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('the ink on a canvas follows the look when told it changed (FE-I69)', () => {
  it('after inkLookChanged the frame being shown is drawn again in the colour the style now gives', () => {
    const { ink, paper, fills } = drawn()
    ink.draw(WASHED)
    expect(fills).toEqual([BEFORE])
    paper.style.color = AFTER
    expect(fills).toEqual([BEFORE])
    inkLookChanged()
    expect(fills).toEqual([BEFORE, AFTER])
    ink.dispose()
  })

  it('not told, it keeps the colours it read: the next frame is drawn in the old colour', () => {
    const { ink, paper, fills } = drawn()
    ink.draw(WASHED)
    paper.style.color = AFTER
    const read = vi.spyOn(globalThis, 'getComputedStyle')
    ink.draw(WASHED)
    expect(fills).toEqual([BEFORE, BEFORE])
    expect(read).not.toHaveBeenCalled()
    ink.dispose()
  })

  it('told before it has shown a frame, it draws nothing and reads the new colour for its first', () => {
    const { ink, paper, fills } = drawn()
    paper.style.color = AFTER
    inkLookChanged()
    expect(fills).toEqual([])
    ink.draw(WASHED)
    expect(fills).toEqual([AFTER])
    ink.dispose()
  })

  it('a canvas that is gone is not drawn again', () => {
    const { ink, paper, fills } = drawn()
    ink.draw(WASHED)
    ink.dispose()
    paper.style.color = AFTER
    const read = vi.spyOn(globalThis, 'getComputedStyle')
    inkLookChanged()
    expect(fills).toEqual([BEFORE])
    expect(read).not.toHaveBeenCalled()
  })
})

describe('the corner the edge of a bubble is drawn with is the corner of its style (FE-I69)', () => {
  const FIGURE: Box = { x: 272, y: 172, width: 56, height: 56 }
  const ORIGIN = [340, 160] as const
  const SIZE = { width: 220, height: 60 }
  const SEED = 1 + Math.floor(0.25 * 0x7ffffffe)

  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.25)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const [x, y] = ORIGIN
      const { width, height } = this.classList.contains('omne-ink-bubble')
        ? SIZE
        : { width: 0, height: 0 }
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
    })
  })

  const edges = (): (string | null)[] =>
    [...document.querySelectorAll('.omne-ink-bubble-edge path')].map(path => path.getAttribute('d'))

  const expected = (radius: number): string[] =>
    bubbleStrokes({
      ...SIZE,
      radius,
      anchor: [FIGURE.x + FIGURE.width / 2 - ORIGIN[0], FIGURE.y + FIGURE.height / 2 - ORIGIN[1]],
      unit: unitOf(FIGURE_SIZE),
      seed: SEED,
      ink: 'full',
    }).map(stroke => stroke.rest)

  const look = (corner: string): HTMLStyleElement => {
    const sheet = document.createElement('style')
    sheet.textContent = `.omne-ink-bubble { --omne-radius-window: ${corner}; }`
    document.head.append(sheet)
    return sheet
  }

  const bubble = (): void => {
    render(createElement(InkBubble, { figure: FIGURE, origin: [...ORIGIN], reduced: true }, '字'))
  }

  afterEach(() => {
    document.head.innerHTML = ''
  })

  it.each(['9px', '15px', '18px'])('is %s when the style gives the window that corner', corner => {
    look(corner)
    bubble()
    expect(edges()).toEqual(expected(Number.parseFloat(corner)))
    expect(edges()).not.toEqual(expected(12))
  })

  it('is 12 when the style gives no corner', () => {
    bubble()
    expect(edges()).toEqual(expected(12))
  })

  it('is drawn again with the corner of the new style text after inkLookChanged', () => {
    const sheet = look('9px')
    bubble()
    sheet.textContent = '.omne-ink-bubble { --omne-radius-window: 18px; }'
    expect(edges()).toEqual(expected(9))
    act(() => inkLookChanged())
    expect(edges()).toEqual(expected(18))
  })
})
