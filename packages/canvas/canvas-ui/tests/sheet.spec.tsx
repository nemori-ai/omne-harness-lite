// @vitest-environment happy-dom
import { cleanup, createEvent, fireEvent, within } from '@testing-library/react'
import { readTenantText } from '@omne-harness/public-contract'
import { PAPER_NAME_LINE } from '@omne-harness/ui-kit'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import {
  canvas,
  handle,
  item,
  memoryPreferences,
  opened,
  page,
  pile,
  placedAt,
  reread,
  screen,
  settle,
  SHEET,
  TENANT,
  type Opened,
} from './fixtures/canvas.tsx'

beforeAll(stubAnimation)
afterEach(cleanup)

const A = item('a', { at: { x: 80, y: 80 }, size: { width: 200, height: 120 }, rank: 1 })
const MOVED = { ...A, at: { x: 96, y: 104 } }

function drag(element: Element, by: [number, number]): void {
  fireEvent.pointerDown(element, { pointerId: 1, button: 0, clientX: 0, clientY: 0 })
  fireEvent.pointerMove(element, { pointerId: 1, clientX: by[0], clientY: by[1] })
  fireEvent.pointerUp(element, { pointerId: 1, clientX: by[0], clientY: by[1] })
}

describe('the sheet draws what was read', () => {
  it('each item where the server says, its box the content and the name line under it; no size is the footprint read', async () => {
    const sized = item('b', { at: { x: 400, y: 200 }, size: null, rank: 2 })
    await opened(canvas([A, sized]))
    expect(placedAt(page('a'))).toEqual({ x: 80, y: 80, width: 200, height: 120 + PAPER_NAME_LINE })
    expect(placedAt(page('b'))).toEqual({
      x: 400,
      y: 200,
      width: SHEET.footprint.width,
      height: SHEET.footprint.height + PAPER_NAME_LINE,
    })
    expect(page('a').getAttribute('aria-label')).toBe('便签')
  })

  it('an item off the sheet is drawn inside it, and nothing is sent to move it', async () => {
    const off = item('c', { at: { x: 1550, y: 880 } })
    const world = await opened(canvas([off]))
    expect(placedAt(page('c'))).toEqual({ x: 1400, y: 758, width: 200, height: 142 })
    expect(world.fake.calls.map(call => call.operation)).toEqual(['look', 'kinds'])
  })

  it('the higher rank is drawn over the lower one', async () => {
    const low = item('low', { rank: 1 })
    const high = item('high', { rank: 5 })
    await opened(canvas([high, low]))
    const order = Array.from(document.querySelectorAll('[data-item]')).map(
      element => (element as HTMLElement).dataset['item'],
    )
    expect(order).toEqual(['low', 'high'])
  })

  it('a pile shows its pages, the highest rank on top, and opens and closes', async () => {
    const under = item('u', { pile: 'p', rank: 1 })
    const over = item('o', { pile: 'p', rank: 3 })
    await opened(canvas([under, over], [pile('p', { name: '周报' })]))
    const drawn = screen.getByRole('group', { name: '周报' })
    expect(drawn.dataset['state']).toBe('closed')
    expect(within(drawn).getByText('2')).toBeTruthy()
    const leaves = Array.from(drawn.querySelectorAll('[data-depth]')).map(
      leaf => leaf.querySelector('.canvas-generic-ref, [data-standing]')?.textContent,
    )
    expect(leaves).toEqual(['便签ref-u', '便签ref-o'])
    fireEvent.click(within(drawn).getByRole('button', { name: '展开' }))
    expect(drawn.dataset['state']).toBe('open')
    fireEvent.click(within(drawn).getByRole('button', { name: '收起' }))
    expect(drawn.dataset['state']).toBe('closed')
  })

  it('an open pile draws each page at its own size, or at the footprint when it has none', async () => {
    const sized = item('s', { pile: 'p', rank: 2, size: { width: 240, height: 144 } })
    const plain = item('n', { pile: 'p', rank: 1, size: null })
    await opened(canvas([sized, plain], [pile('p', { name: '周报' })]))
    const drawn = screen.getByRole('group', { name: '周报' })
    fireEvent.click(within(drawn).getByRole('button', { name: '展开' }))
    const sizes = [...drawn.querySelectorAll<HTMLElement>('[data-depth]')].map(leaf => [
      Number(leaf.style.getPropertyValue('--omne-paper-leaf-w')),
      Number(leaf.style.getPropertyValue('--omne-paper-leaf-h')),
    ])
    expect(sizes).toEqual([
      [240, 144],
      [SHEET.footprint.width, SHEET.footprint.height],
    ])
  })
})

describe('a drag is a preview; the release sends a command, and the sheet is read again', () => {
  async function dragged(): Promise<Opened> {
    const world = await opened(canvas([A]))
    drag(handle('a'), [13, 22])
    await settle()
    return world
  }

  it('the landing goes out on the grid; until the answer the page is not settled and stays where it was', async () => {
    const world = await dragged()
    const sent = await world.fake.next('arrange')
    expect(sent.body).toEqual({
      tenant: expect.anything(),
      canvas: 'main',
      items: [{ item: 'a', at: { x: 96, y: 104 } }],
    })
    expect(page('a').getAttribute('aria-busy')).toBe('true')
    expect(placedAt(page('a'))).toMatchObject({ x: 80, y: 80 })
    sent.answer({ outcome: 'succeeded', body: { revision: 2 } })
    await settle()
    expect(page('a').getAttribute('aria-busy')).toBe('true')
    await reread(world, canvas([MOVED]))
    expect(page('a').getAttribute('aria-busy')).toBeNull()
    expect(placedAt(page('a'))).toMatchObject({ x: 96, y: 104 })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('no change is drawn as read again, without a word', async () => {
    const world = await dragged()
    ;(await world.fake.next('arrange')).answer({ outcome: 'no-change', body: {} })
    await reread(world, canvas([A]))
    expect(placedAt(page('a'))).toMatchObject({ x: 80, y: 80 })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it.each([
    ['unknown', { outcome: 'unknown' }, '不知道这一步做成了没有，纸上画的是刚读到的样子。'],
    [
      'locked',
      { outcome: 'conflict', body: { reason: 'locked', entry: { item: 'a' } } },
      '它锁着，先解开才能动。',
    ],
    ['not found', { outcome: 'not-found', body: { entry: { item: 'a' } } }, '纸上已经没有它了。'],
    ['basis unavailable', { outcome: 'basis-unavailable' }, '现在改不了画布，过一会再试。'],
  ])(
    'answered %s: read again, drawn as read, and the person is told why',
    async (_, answer, said) => {
      const world = await dragged()
      ;(await world.fake.next('arrange')).answer(answer)
      const elsewhere = { ...A, at: { x: 240, y: 320 } }
      await reread(world, canvas([elsewhere]))
      expect(placedAt(page('a'))).toMatchObject({ x: 240, y: 320 })
      expect(page('a').getAttribute('aria-busy')).toBeNull()
      expect(screen.getByRole('status').textContent).toContain(said)
    },
  )

  it('a call that throws is not known either: read again and drawn as read', async () => {
    const world = await dragged()
    ;(await world.fake.next('arrange')).fail(new Error('the line broke'))
    await reread(world, canvas([A]))
    expect(placedAt(page('a'))).toMatchObject({ x: 80, y: 80 })
    expect(screen.getByRole('status').textContent).toContain('不知道这一步做成了没有')
  })

  it('a resize sends the content size, without the name line', async () => {
    const world = await opened(canvas([A]))
    const corner = page('a').querySelector('[data-corner="se"]')!
    drag(corner, [37, 50])
    await settle()
    const sent = await world.fake.next('arrange')
    expect(sent.body.items).toEqual([
      { item: 'a', at: { x: 80, y: 80 }, size: { width: 240, height: 168 } },
    ])
  })

  it('a resize is held within the least and most sizes the sheet gives', async () => {
    const { preferences } = memoryPreferences({ magnet: 'off' })
    const world = await opened(canvas([A]), undefined, preferences)
    drag(page('a').querySelector('[data-corner="se"]')!, [600, 600])
    await settle()
    const grown = await world.fake.next('arrange')
    expect(grown.body.items).toEqual([{ item: 'a', at: { x: 80, y: 80 }, size: SHEET.size.max }])
    grown.answer({ outcome: 'succeeded', body: { revision: 2 } })
    await reread(world, canvas([A]))
    drag(page('a').querySelector('[data-corner="se"]')!, [-600, -600])
    await settle()
    const shrunk = await world.fake.next('arrange')
    expect(shrunk.body.items).toEqual([{ item: 'a', at: { x: 80, y: 80 }, size: SHEET.size.min }])
  })

  it('a press brings a page under another to the top', async () => {
    const world = await opened(canvas([A, item('b', { rank: 4 })]))
    fireEvent.pointerDown(handle('a'), { pointerId: 1, button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerUp(handle('a'), { pointerId: 1, clientX: 0, clientY: 0 })
    const sent = await world.fake.next('arrange')
    expect(sent.body.items).toEqual([{ item: 'a', top: true }])
    expect(page('a').dataset['selected']).toBe('true')
  })

  it('the tenant of every command is the one the back is drawn for', async () => {
    const world = await dragged()
    const sent = await world.fake.next('arrange')
    expect(sent.body.tenant).toEqual(readTenantText(TENANT))
  })
})

describe('into a pile and out of it, by the pointer', () => {
  const C = item('c', { pile: 'p', rank: 2 })

  it('a page dropped with the pointer over a pile goes into it; over bare paper it only moves', async () => {
    const world = await opened(canvas([A, C], [pile('p', { at: { x: 800, y: 400 } })]))
    drag(handle('a'), [13, 22])
    const into = await world.fake.next('arrange')
    expect(into.body.items).toEqual([{ item: 'a', pile: 'p' }])
    into.answer({ outcome: 'succeeded', body: { revision: 2 } })
    await reread(world, canvas([A, C], [pile('p', { at: { x: 100, y: 700 } })]))
    drag(handle('a'), [13, 22])
    const moved = await world.fake.next('arrange')
    expect(moved.body.items).toEqual([{ item: 'a', at: { x: 96, y: 104 } }])
  })

  it('a page dragged out of an open pile lands where it is dropped, on the grid', async () => {
    const world = await opened(canvas([A, C], [pile('p', { name: '周报' })]))
    const drawn = screen.getByRole('group', { name: '周报' })
    fireEvent.click(within(drawn).getByRole('button', { name: '展开' }))
    const held = new Map<string, string>()
    const dataTransfer = {
      setData: (type: string, value: string) => void held.set(type, value),
      getData: (type: string) => held.get(type) ?? '',
    }
    const leaf = drawn.querySelector<HTMLElement>('.canvas-leaf')!
    expect(leaf.getAttribute('draggable')).toBe('true')
    fireEvent.dragStart(leaf, { dataTransfer })
    const surface = screen.getByRole('region', { name: /^纸/u })
    const drop = createEvent.drop(surface)
    Object.defineProperties(drop, {
      clientX: { value: -403 },
      clientY: { value: -317 },
      dataTransfer: { value: dataTransfer },
    })
    fireEvent(surface, drop)
    const out = await world.fake.next('arrange')
    expect(out.body.items).toEqual([{ item: 'c', pile: null, at: { x: 400, y: 136 } }])
  })
})
