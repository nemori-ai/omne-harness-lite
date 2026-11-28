// @vitest-environment happy-dom
import { cleanup, fireEvent } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
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
    const world = await opened(canvas([]))
    const mark = screen.getByRole('button', { name: '翻到正面' })
    expect(mark.tabIndex).toBeGreaterThanOrEqual(0)
    mark.focus()
    fireEvent.click(mark)
    expect(world.shell.asked).toEqual(['turn'])
  })

  it('is there while the canvas cannot be read, so the back can always be left', async () => {
    const world = await opening()
    ;(await world.fake.next('look')).answer({ outcome: 'basis-unavailable' })
    await settle()
    expect(screen.getByText('现在读不到画布。')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '翻到正面' }))
    expect(world.shell.asked).toEqual(['turn'])
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

  it('is a button the keyboard reaches, named for the front; a press asks the shell to go home, and only that', async () => {
    const world = await opened(canvas([]))
    const seat = screen.getByRole('button', { name: '回到正面' })
    expect(seat.querySelector('[data-figure-seat="canvas"]')).not.toBeNull()
    expect(seat.tagName).toBe('BUTTON')
    expect(seat.tabIndex).toBeGreaterThanOrEqual(0)
    seat.focus()
    expect(fireEvent.keyDown(seat, { key: 'Enter' })).toBe(true)
    expect(fireEvent.keyDown(seat, { key: ' ' })).toBe(true)
    expect(fireEvent.contextMenu(seat)).toBe(true)
    expect(world.shell.asked).toEqual([])
    fireEvent.click(seat)
    expect(world.shell.asked).toEqual(['home'])
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
