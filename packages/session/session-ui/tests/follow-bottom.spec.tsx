// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useFollowBottom } from '../src/view/scroll.ts'

type Observed = { callback: () => void; target: Element | null; disconnected: boolean }

let observed: Observed[] = []

beforeEach(() => {
  observed = []
  vi.stubGlobal(
    'ResizeObserver',
    class {
      readonly #entry: Observed
      constructor(callback: () => void) {
        this.#entry = { callback, target: null, disconnected: false }
        observed.push(this.#entry)
      }
      observe(target: Element): void {
        this.#entry.target = target
      }
      disconnect(): void {
        this.#entry.disconnected = true
      }
    },
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function Transcript({ rows = 0 }: { readonly rows?: number }) {
  const { scroller, onScroll } = useFollowBottom(rows)
  return <div data-testid="transcript" ref={scroller} onScroll={onScroll} />
}

function sized(element: HTMLElement, scrollHeight: number, clientHeight: number): void {
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: scrollHeight })
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: clientHeight })
}

function followedAt(element: HTMLElement, scrollHeight: number, clientHeight: number): void {
  sized(element, scrollHeight, clientHeight)
  observed[0]!.callback()
  element.scrollTop = scrollHeight - clientHeight
}

it('keeps the end of the transcript in view when its own box gets smaller', () => {
  const element = render(<Transcript />).getByTestId('transcript')
  expect(observed).toHaveLength(1)
  expect(observed[0]!.target).toBe(element)
  sized(element, 900, 300)
  element.scrollTop = 600

  sized(element, 900, 120)
  observed[0]!.callback()

  expect(element.scrollTop).toBe(900)
})

it('leaves the transcript where the reader scrolled it when its box changes size', () => {
  const element = render(<Transcript />).getByTestId('transcript')
  sized(element, 900, 300)
  element.scrollTop = 100
  fireEvent.scroll(element)

  sized(element, 900, 120)
  observed[0]!.callback()

  expect(element.scrollTop).toBe(100)
})

it('keeps following when a scroll event arrives after the content grew unseen', () => {
  const view = render(<Transcript rows={1} />)
  const element = view.getByTestId('transcript')
  followedAt(element, 900, 300)

  sized(element, 1100, 300)
  fireEvent.scroll(element)
  view.rerender(<Transcript rows={2} />)

  expect(element.scrollTop).toBe(1100)
})

it('keeps following when a scroll event arrives after its box got smaller, before the observer', () => {
  const element = render(<Transcript />).getByTestId('transcript')
  followedAt(element, 900, 300)

  sized(element, 900, 120)
  fireEvent.scroll(element)
  observed[0]!.callback()

  expect(element.scrollTop).toBe(900)
})

it('stops following when the reader scrolls away while the content grows', () => {
  const view = render(<Transcript rows={1} />)
  const element = view.getByTestId('transcript')
  followedAt(element, 900, 300)

  sized(element, 1100, 300)
  element.scrollTop = 400
  fireEvent.scroll(element)
  view.rerender(<Transcript rows={2} />)

  expect(element.scrollTop).toBe(400)
})

it('keeps following after the content got shorter and the position was pulled back', () => {
  const element = render(<Transcript />).getByTestId('transcript')
  followedAt(element, 900, 300)

  sized(element, 700, 300)
  element.scrollTop = 400
  fireEvent.scroll(element)
  sized(element, 800, 300)
  observed[0]!.callback()

  expect(element.scrollTop).toBe(800)
})

it('goes back to the end when a hidden page is shown again', () => {
  const element = render(<Transcript />).getByTestId('transcript')
  followedAt(element, 900, 300)

  sized(element, 0, 0)
  observed[0]!.callback()
  sized(element, 900, 300)
  element.scrollTop = 0
  observed[0]!.callback()

  expect(element.scrollTop).toBe(900)
})

it('leaves a reader who scrolled away where he was when a hidden page is shown again', () => {
  const element = render(<Transcript />).getByTestId('transcript')
  followedAt(element, 900, 300)
  element.scrollTop = 100
  fireEvent.scroll(element)

  sized(element, 0, 0)
  observed[0]!.callback()
  sized(element, 900, 300)
  fireEvent.scroll(element)
  observed[0]!.callback()

  expect(element.scrollTop).toBe(100)
})

it('stops watching the box when the transcript is taken down', () => {
  const view = render(<Transcript />)
  expect(observed[0]!.disconnected).toBe(false)
  view.unmount()
  expect(observed[0]!.disconnected).toBe(true)
})
