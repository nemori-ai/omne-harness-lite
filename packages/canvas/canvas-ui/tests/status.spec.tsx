// @vitest-environment happy-dom
import { act, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { canvas, handle, item, opened, page, pile, screen } from './fixtures/canvas.tsx'

beforeAll(stubAnimation)
afterEach(cleanup)

const AGENT = { kind: 'agent', session: 's' } as const

const info = (): HTMLElement => {
  const found = document.querySelector<HTMLElement>('[data-slot="paper-status-info"]')
  if (found === null) throw new Error('no status bar')
  return found
}

/** What the info segment says now; nothing while it is fading out what it said last. */
const says = (): string | null => (info().hasAttribute('data-empty') ? null : info().textContent)
const marks = (): (string | null)[] =>
  [...info().querySelectorAll('svg[data-icon]')].map(svg => svg.getAttribute('data-icon'))

const surface = (): HTMLElement => screen.getByRole('region', { name: /^纸，/u })
const over = (element: Element): void => {
  fireEvent.pointerOver(element)
}
const focusOn = (element: HTMLElement): void => act(() => element.focus())
const blur = (): void => act(() => (document.activeElement as HTMLElement | null)?.blur())
const toggle = (element: HTMLElement): void => {
  focusOn(element)
  fireEvent.keyDown(element, { key: ' ' })
}

const A = item('a', { at: { x: 80, y: 80 }, rank: 1 })
const B = item('b', { at: { x: 400, y: 80 }, rank: 2, by: AGENT })
const LOCKED = item('l', { at: { x: 80, y: 400 }, rank: 3, locked: true })
const APP = item('app', {
  at: { x: 400, y: 400 },
  rank: 4,
  reference: { kind: 'canvas.app', ref: 'clock' },
})

describe('the status bar under the paper says what is looked at', () => {
  it('says nothing, not a hint nor a count, while nothing is looked at', async () => {
    await opened(canvas([A, B]))
    expect(says()).toBeNull()
    over(surface())
    expect(says()).toBeNull()
  })

  it('for the page under the pointer writes its kind, who placed it with their mark, and when', async () => {
    await opened(canvas([A, B]))
    over(page('a'))
    expect(says()).toMatch(/^便签人\S/u)
    expect(marks()).toEqual(['contact'])
    expect(info().querySelector('time')).not.toBeNull()
    over(page('b'))
    expect(says()).toMatch(/^便签agent/u)
    expect(marks()).toEqual(['assistant'])
  })

  it('names a canvas app by its name, and writes a lock and the word when it is locked', async () => {
    await opened(canvas([APP, LOCKED]))
    over(page('app'))
    expect(says()).toContain('clock')
    expect(says()).not.toContain('锁着')
    over(page('l'))
    expect(says()).toMatch(/锁着$/u)
    expect(marks()).toEqual(['contact', 'lock'])
  })

  it('without a pointer on a page follows the keyboard focus, and the pointer wins over it', async () => {
    await opened(canvas([A, B]))
    focusOn(handle('b'))
    expect(says()).toMatch(/^便签agent/u)
    over(page('a'))
    expect(says()).toMatch(/^便签人/u)
    over(surface())
    expect(says()).toMatch(/^便签agent/u)
    blur()
    expect(says()).toBeNull()
  })

  it('with neither pointer nor focus on a page says the one thing selected, or how many are', async () => {
    await opened(canvas([A, B]))
    toggle(handle('b'))
    blur()
    expect(says()).toMatch(/^便签agent/u)
    toggle(handle('a'))
    blur()
    expect(says()).toBe('选中 2 样')
    over(page('a'))
    expect(says()).toMatch(/^便签人/u)
  })

  it('for a pile writes its name, how many pages it has and who placed it', async () => {
    const under = item('u', { pile: 'p', rank: 1 })
    const top = item('o', { pile: 'p', rank: 2 })
    await opened(canvas([under, top], [pile('p', { name: '周报', by: AGENT })]))
    over(screen.getByRole('group', { name: '周报' }))
    expect(says()).toMatch(/^周报2 页agent/u)
    expect(marks()).toEqual(['assistant'])
  })
})
