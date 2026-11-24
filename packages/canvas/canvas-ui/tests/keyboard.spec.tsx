// @vitest-environment happy-dom
import { cleanup, fireEvent, within } from '@testing-library/react'
import type { CanvasBody } from '@omne-harness/canvas-protocol'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import {
  canvas,
  handle,
  item,
  opened,
  page,
  pile,
  reread,
  screen,
  settle,
  type Opened,
} from './fixtures/canvas.tsx'

beforeAll(stubAnimation)
afterEach(cleanup)

/** Where Tab would land: only an element in the tab order may be focused here. */
function tabTo(element: HTMLElement): HTMLElement {
  expect(element.tabIndex).toBeGreaterThanOrEqual(0)
  element.focus()
  expect(document.activeElement).toBe(element)
  return element
}

function press(key: string, init: Partial<KeyboardEventInit> = {}): void {
  fireEvent.keyDown(document.activeElement ?? document.body, { key, ...init })
}

/** The one command a key sent, answered as done, and the sheet read as the server now has it. */
async function sent(world: Opened, operation: string, after: CanvasBody): Promise<unknown> {
  const call = await world.fake.next(operation)
  const { tenant: _, canvas: __, ...body } = call.body as Record<string, unknown>
  call.answer({ outcome: 'succeeded', body: { revision: 2 } })
  await settle()
  await reread(world, after)
  return body
}

const pileHandle = () =>
  within(screen.getByRole('group', { name: '周报' })).getAllByRole('button')[0]!

describe('everything a person does on the canvas, with the keyboard only', () => {
  it('moves, sizes, piles two, names the pile, takes one out, scatters, locks, unlocks and takes away', async () => {
    const a = item('a', { at: { x: 80, y: 80 }, rank: 1 })
    const b = item('b', { at: { x: 400, y: 80 }, rank: 2 })
    const world = await opened(canvas([a, b]))

    tabTo(handle('a'))
    press('ArrowRight')
    const moved = { ...a, at: { x: 88, y: 80 } }
    expect(await sent(world, 'arrange', canvas([moved, b]))).toEqual({
      items: [{ item: 'a', at: { x: 88, y: 80 }, top: true }],
    })

    tabTo(handle('a'))
    press('ArrowDown', { shiftKey: true })
    const sized = { ...moved, size: { width: 200, height: 130 } }
    expect(await sent(world, 'arrange', canvas([sized, b]))).toEqual({
      items: [{ item: 'a', at: { x: 88, y: 80 }, size: { width: 200, height: 130 }, top: true }],
    })

    tabTo(handle('a'))
    press(' ')
    tabTo(handle('b'))
    press(' ')
    expect(page('a').dataset['selected']).toBe('true')
    expect(page('b').dataset['selected']).toBe('true')
    press('g')
    const call = await world.fake.next('pile')
    const id = (call.body as { pile: string }).pile
    expect(id).toMatch(/^pile-/u)
    expect(call.body).toMatchObject({ items: ['b', 'a'] })
    call.answer({ outcome: 'succeeded', body: { revision: 3 } })
    await settle()
    const piled = (name: string | null) =>
      canvas(
        [
          { ...sized, pile: id },
          { ...b, pile: id },
        ],
        [pile(id, { name })],
      )
    await reread(world, piled(null))

    tabTo(within(screen.getByRole('group', { name: '没有名字的一叠' })).getAllByRole('button')[0]!)
    press('F2')
    const field = screen.getByRole('textbox', { name: '一叠的名字' })
    expect(document.activeElement).toBe(field)
    fireEvent.change(field, { target: { value: '周报' } })
    press('Enter')
    expect(await sent(world, 'arrange', piled('周报'))).toEqual({
      piles: [{ pile: id, name: '周报' }],
    })

    tabTo(pileHandle())
    press('Enter')
    expect(screen.getByRole('group', { name: '周报' }).dataset['state']).toBe('open')
    const leaf = screen.getByRole('group', { name: '周报' }).querySelector('[data-depth="1"]')!
    tabTo(within(leaf as HTMLElement).getByRole('button', { name: /更多操作/u }))
    press('o')
    const outOfPile = canvas([sized, { ...b, pile: id }], [pile(id, { name: '周报' })])
    expect(await sent(world, 'arrange', outOfPile)).toEqual({ items: [{ item: 'a', pile: null }] })

    tabTo(pileHandle())
    press('s')
    expect(await sent(world, 'scatter', canvas([sized, b]))).toEqual({ pile: id })

    tabTo(handle('a'))
    press('l')
    const locked = { ...sized, locked: true }
    expect(await sent(world, 'lock', canvas([locked, b]))).toEqual({ items: ['a'], locked: true })

    const mark = tabTo(within(page('a')).getByRole('button', { name: '锁着，解开' }))
    expect(mark.getAttribute('aria-keyshortcuts')).toBe('L')
    press('l')
    expect(await sent(world, 'lock', canvas([sized, b]))).toEqual({ items: ['a'], locked: false })

    tabTo(handle('b'))
    press('Delete')
    expect(await sent(world, 'take', canvas([sized]))).toEqual({ items: ['b'] })
  })
})

describe('a locked page', () => {
  const locked = item('a', { locked: true })

  it('has the lock mark and no handle to drag or size it; the keyboard does not move it', async () => {
    const world = await opened(canvas([locked]))
    expect(page('a').querySelector('[data-slot="paper-handle"], [data-corner]')).toBeNull()
    const mark = tabTo(within(page('a')).getByRole('button', { name: '锁着，解开' }))
    press('ArrowRight')
    press('ArrowDown', { shiftKey: true })
    await settle()
    expect(world.fake.calls.filter(call => call.operation === 'arrange')).toEqual([])
    fireEvent.click(mark)
    const unlock = await world.fake.next('lock')
    expect(unlock.body).toMatchObject({ items: ['a'], locked: false })
  })

  it('a page not locked is locked from its menu, the key written beside it', async () => {
    await opened(canvas([item('a')]))
    const more = within(page('a')).getByRole('button', { name: '便签的更多操作' })
    fireEvent.pointerDown(more, { button: 0, ctrlKey: false })
    const lock = await screen.findByRole('menuitem', { name: /锁上/u })
    expect(lock.getAttribute('aria-keyshortcuts')).toBe('L')
    expect(lock.textContent).toContain('L')
  })
})
