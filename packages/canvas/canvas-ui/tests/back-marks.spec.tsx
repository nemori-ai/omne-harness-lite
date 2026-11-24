// @vitest-environment happy-dom
import { cleanup, fireEvent } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import {
  canvas,
  handle,
  item,
  opened,
  opening,
  page,
  screen,
  SHEET,
  settle,
} from './fixtures/canvas.tsx'

beforeAll(stubAnimation)
afterEach(cleanup)

describe('the corner of the back turns to the front', () => {
  it('a control the keyboard reaches, named for the front, that calls the shell to turn', async () => {
    const turn = vi.fn()
    await opened(canvas([]), undefined, undefined, turn)
    const mark = screen.getByRole('button', { name: '翻到正面' })
    expect(mark.tabIndex).toBeGreaterThanOrEqual(0)
    mark.focus()
    fireEvent.click(mark)
    expect(turn).toHaveBeenCalledTimes(1)
  })

  it('is there while the canvas cannot be read, so the back can always be left', async () => {
    const turn = vi.fn()
    const world = await opening(undefined, turn)
    ;(await world.fake.next('look')).answer({ outcome: 'basis-unavailable' })
    await settle()
    expect(screen.getByText('现在读不到画布。')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '翻到正面' }))
    expect(turn).toHaveBeenCalledTimes(1)
  })
})

describe('the seat of the figure', () => {
  it('is in the middle of the sheet, named canvas', async () => {
    await opened(canvas([]))
    const seat = document.querySelector<HTMLElement>('[data-figure-seat="canvas"]')!
    const spot = seat.closest<HTMLElement>('[data-slot="paper-spot"]')!
    expect([
      spot.style.getPropertyValue('--omne-paper-x'),
      spot.style.getPropertyValue('--omne-paper-y'),
    ]).toEqual([String(SHEET.width / 2), String(SHEET.height / 2)])
  })
})

describe('Escape lets go of what is selected', () => {
  it('two selected with the keyboard, Escape on the paper selects none', async () => {
    await opened(canvas([item('a'), item('b', { at: { x: 400, y: 80 } })]))
    for (const id of ['a', 'b']) {
      handle(id).focus()
      fireEvent.keyDown(handle(id), { key: ' ' })
    }
    expect(page('a').dataset['selected']).toBe('true')
    expect(page('b').dataset['selected']).toBe('true')
    fireEvent.keyDown(handle('b'), { key: 'Escape' })
    expect(page('a').dataset['selected']).toBeUndefined()
    expect(page('b').dataset['selected']).toBeUndefined()
  })
})
