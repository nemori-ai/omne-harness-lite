// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'

import { FIGURE_SIZE, InkMotes } from '../src/index.ts'

afterEach(cleanup)

it('墨点画在和形一样大的一块里，读屏不读，不算一个形', () => {
  const view = render(<InkMotes doing="thinking" listening carried={false} />)
  const motes = view.container.querySelector<HTMLElement>('[data-ink-motes]')
  expect(motes?.getAttribute('aria-hidden')).toBe('true')
  expect(motes?.style.width).toBe(`${FIGURE_SIZE}px`)
  expect(motes?.style.height).toBe(`${FIGURE_SIZE}px`)
  expect(motes?.querySelector('canvas')).not.toBeNull()
  expect(view.container.querySelector('[data-figure-ink]')).toBeNull()
  view.rerender(<InkMotes doing="idle" carried />)
  expect(view.container.querySelectorAll('[data-ink-motes]')).toHaveLength(1)
  view.unmount()
})
