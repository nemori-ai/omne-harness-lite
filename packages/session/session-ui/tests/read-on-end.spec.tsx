// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReadOnEnd } from '../src/view/read-on-end.tsx'
import { stubInView } from './fixtures/in-view.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const FIRST = { page: 1 }
const SECOND = { page: 2 }

describe('the end of a list reads on by itself (A4)', () => {
  it('reads the next page once the end comes into view, and not while it is out of view', () => {
    const view = stubInView()
    const read = vi.fn()
    render(<ReadOnEnd page={FIRST} read={read} />)
    act(() => view.leave())
    expect(read).not.toHaveBeenCalled()
    act(() => view.enter())
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('asks once per page: while that read is under way the end coming into view again asks nothing', () => {
    const view = stubInView()
    const read = vi.fn()
    const { rerender } = render(<ReadOnEnd page={FIRST} read={read} />)
    act(() => view.enter())
    act(() => view.leave())
    act(() => view.enter())
    rerender(<ReadOnEnd page={FIRST} read={read} />)
    act(() => view.enter())
    expect(read).toHaveBeenCalledTimes(1)
    rerender(<ReadOnEnd page={SECOND} read={read} />)
    act(() => view.enter())
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('with no page after the one shown there is no end to watch, and nothing is read', () => {
    const view = stubInView()
    const read = vi.fn()
    const { container, rerender } = render(<ReadOnEnd page={FIRST} read={read} />)
    expect(view.watched()).toHaveLength(1)
    rerender(<ReadOnEnd page={null} read={read} />)
    expect(view.watched()).toEqual([])
    expect(container.querySelector('[data-list-end]')).toBeNull()
    act(() => view.enter())
    expect(read).not.toHaveBeenCalled()
  })

  it('watches from the scroller the list sits in, and calls the read it was given last', () => {
    const view = stubInView()
    const first = vi.fn()
    const last = vi.fn()
    const { rerender } = render(
      <div className="scroller" style={{ overflowY: 'auto' }}>
        <div>
          <ReadOnEnd page={FIRST} read={first} />
        </div>
      </div>,
    )
    const [watch] = view.watched()
    expect(watch?.element.getAttribute('aria-hidden')).toBe('true')
    expect((watch?.root as HTMLElement | null)?.className).toBe('scroller')
    rerender(
      <div className="scroller" style={{ overflowY: 'auto' }}>
        <div>
          <ReadOnEnd page={FIRST} read={last} />
        </div>
      </div>,
    )
    act(() => view.enter())
    expect(first).not.toHaveBeenCalled()
    expect(last).toHaveBeenCalledTimes(1)
  })
})
