// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FigureSeat, FigureStage, FlipLayer, useFaceFlip, type FaceFlip } from '../src/index.ts'
import { FLIP } from '../src/paper/flip.ts'

type Face = 'front' | 'back'

const rect = (left: number, top: number, side: number): DOMRect =>
  ({
    left,
    top,
    width: side,
    height: side,
    x: left,
    y: top,
    right: left + side,
    bottom: top + side,
    toJSON: () => ({}),
  }) as DOMRect

let reduced = false

beforeEach(() => {
  reduced = false
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
    ],
  })
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduced-motion') && reduced,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const seat = this.dataset['figureSeat']
    if (seat === undefined) return rect(0, 0, 0)
    return seat === 'front' ? rect(12, 36, 32) : rect(600, 400, 32)
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function Faces({ held, pressed }: { held: { flip?: FaceFlip }; pressed: () => void }) {
  const flip = useFaceFlip()
  held.flip = flip
  const [face, setFace] = useState<Face>('front')
  return (
    <>
      <button
        type="button"
        onClick={() =>
          flip.turn(face === 'front' ? 'right' : 'left', () =>
            setFace(face === 'front' ? 'back' : 'front'),
          )
        }
      >
        翻
      </button>
      <section data-face="front" inert={face !== 'front'}>
        <FigureSeat name="front" />
        <button type="button" onClick={pressed}>
          底下
        </button>
      </section>
      <section data-face="back" inert={face !== 'back'}>
        <FigureSeat name="back" />
      </section>
      <FlipLayer
        flip={flip}
        leaving={() => document.querySelector<HTMLElement>('[data-face][inert]')}
      />
    </>
  )
}

function mount() {
  const held: { flip?: FaceFlip } = {}
  const pressed = vi.fn()
  const view = render(
    <FigureStage label="形">
      <Faces held={held} pressed={pressed} />
    </FigureStage>,
  )
  act(() => void vi.advanceTimersByTime(50))
  const face = (name: Face) => view.container.querySelector<HTMLElement>(`[data-face="${name}"]`)!
  const layer = () => document.querySelector<HTMLElement>('.omne-flip')
  const figure = () => document.querySelector<HTMLElement>('.omne-figure-carried')?.dataset['phase']
  const turn = () => act(() => view.getByRole('button', { name: '翻' }).click())
  const pass = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
  return { held, pressed, face, layer, figure, turn, pass }
}

describe('the flip layer', () => {
  it('lies over the faces while it turns, narrows the face it leaves from the far edge, and puts it back at rest', () => {
    const t = mount()
    expect(t.figure()).toBe('seated')
    t.turn()
    expect(t.face('front').hasAttribute('inert')).toBe(true)
    expect(t.layer()?.dataset['toward']).toBe('right')
    expect(t.face('front').style.transformOrigin).toBe('right center')
    expect(t.face('front').style.transform).toBe('scaleX(1.00000)')
    expect(t.figure()).toBe('flying')
    t.pass(FLIP.approach.most + 300)
    expect(t.layer()?.dataset['phase']).toBe('carry')
    const kept = Number(/scaleX\(([\d.]+)\)/.exec(t.face('front').style.transform)?.[1])
    expect(kept).toBeGreaterThan(0)
    expect(kept).toBeLessThan(1)
    t.pass(FLIP.most)
    expect(t.layer()).toBeNull()
    expect(t.face('front').style.transform).toBe('')
    expect(t.face('back').hasAttribute('inert')).toBe(false)
    t.pass(400)
    expect(t.figure()).toBe('seated')
  })

  it('stops on the new face when pressed, and the press does not reach what lies beneath', () => {
    const t = mount()
    t.turn()
    t.pass(500)
    const layer = t.layer()!
    act(() => {
      fireEvent.pointerDown(layer, { button: 0 })
      fireEvent.pointerUp(layer, { button: 0 })
    })
    expect(t.layer(), 'still there for the click that ends the press').toBe(layer)
    act(() => {
      fireEvent.click(layer)
    })
    expect(t.held.flip?.current()).toEqual({ phase: 'idle', cut: true })
    expect(t.face('back').hasAttribute('inert')).toBe(false)
    expect(t.face('front').style.transform).toBe('')
    expect(t.figure()).toBe('seated')
    expect(t.pressed).not.toHaveBeenCalled()
    t.pass(10)
    expect(t.layer()).toBeNull()
  })

  it('swallows the right press that stops it too', () => {
    const t = mount()
    t.turn()
    act(() => {
      fireEvent.pointerDown(t.layer()!, { button: 2 })
    })
    const menu = fireEvent.contextMenu(t.layer()!)
    expect(menu).toBe(false)
    act(() => void vi.advanceTimersByTime(0))
    expect(t.layer()).toBeNull()
  })

  it('never lies over anything when motion is reduced: the face changes at once', () => {
    reduced = true
    const t = mount()
    t.turn()
    expect(t.layer()).toBeNull()
    expect(t.face('back').hasAttribute('inert')).toBe(false)
    expect(t.face('front').style.transform).toBe('')
  })
})
