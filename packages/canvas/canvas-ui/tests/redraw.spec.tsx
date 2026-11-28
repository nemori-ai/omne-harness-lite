// @vitest-environment happy-dom
import { cleanup, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { canvasElement, type CanvasElementSubject } from '../src/cordis.ts'
import type { KeyRender } from '@omne-harness/shell-contract'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import {
  canvas,
  handle,
  item,
  NOTE,
  opened,
  page,
  placedAt,
  reread,
  screen,
  settle,
} from './fixtures/canvas.tsx'

beforeAll(stubAnimation)
afterEach(cleanup)

const IDS = ['a', 'b', 'c', 'd', 'e', 'f']
const ITEMS = IDS.map((id, at) => item(id, { at: { x: 40 + at * 240, y: 80 }, rank: at + 1 }))

/** How many times the content of each page was drawn since the case last looked. */
async function counting() {
  const drawn = new Map<string, number>()
  function Counted({ ref }: Readonly<{ ref: string }>): ReactNode {
    drawn.set(ref, (drawn.get(ref) ?? 0) + 1)
    return <p>{ref}</p>
  }
  const render: KeyRender<CanvasElementSubject> = ({ subject }) => (
    <Counted ref={subject.reference.ref} />
  )
  const world = await opened(canvas(ITEMS))
  await world.root.plugin({
    name: 'notes-ui',
    inject: ['shell'],
    apply: ctx => void canvasElement.put(ctx.shell, NOTE, render),
  })
  await settle()
  const since = (): Readonly<Record<string, number>> => {
    const seen = Object.fromEntries(IDS.map(id => [id, drawn.get(`ref-${id}`) ?? 0]))
    drawn.clear()
    return seen
  }
  since()
  return { world, since }
}

const none = Object.fromEntries(IDS.map(id => [id, 0]))

function drag(element: Element, by: [number, number]): void {
  fireEvent.pointerDown(element, { pointerId: 1, button: 0, clientX: 0, clientY: 0 })
  fireEvent.pointerMove(element, { pointerId: 1, clientX: by[0], clientY: by[1] })
  fireEvent.pointerUp(element, { pointerId: 1, clientX: by[0], clientY: by[1] })
}

describe('a page is drawn again only when what it shows changes', () => {
  it('a change of the zoom or of the view draws no page again', async () => {
    const { since } = await counting()
    const surface = screen.getByRole('region', { name: /^纸/u })
    surface.focus()
    fireEvent.keyDown(surface, { key: '=' })
    fireEvent.keyDown(surface, { key: 'ArrowRight' })
    expect(screen.getByTitle('远近').textContent).toBe('125%')
    expect(since()).toEqual(none)
  })

  it('a page let go of, and the read after it, draw again that page and none of the others', async () => {
    const { world, since } = await counting()
    drag(handle('a'), [13, 22])
    await settle()
    ;(await world.fake.next('arrange')).answer({ outcome: 'succeeded', body: { revision: 2 } })
    await settle()
    const moved = ITEMS.map(one => (one.id === 'a' ? { ...one, at: { x: 56, y: 104 } } : one))
    await reread(world, canvas(moved.map(one => ({ ...one }))))
    expect(placedAt(page('a'))).toMatchObject({ x: 56, y: 104 })
    expect(page('a').getAttribute('aria-busy')).toBeNull()
    const seen = since()
    expect(seen['a']).toBeGreaterThan(0)
    expect({ ...seen, a: 0 }).toEqual(none)
  })

  it('a batch the server tells of draws again the pages it moved, and none of the others', async () => {
    const { world, since } = await counting()
    world.fake.observations[0]?.frame()
    await settle()
    const moved = ITEMS.map(one =>
      one.id === 'b' || one.id === 'c' ? { ...one, at: { ...one.at, y: 400 } } : { ...one },
    )
    await reread(world, canvas(moved))
    expect(placedAt(page('b'))).toMatchObject({ y: 400 })
    const seen = since()
    expect(seen['b']).toBeGreaterThan(0)
    expect(seen['c']).toBeGreaterThan(0)
    expect({ ...seen, b: 0, c: 0 }).toEqual(none)
  })

  it('a change of the drawings of the kind draws every page again: in conflict, and back to the one left', async () => {
    const { world, since } = await counting()
    const other = world.root.plugin({
      name: 'brand-ui',
      inject: ['shell'],
      apply: ctx => void canvasElement.put(ctx.shell, NOTE, () => <p>品牌</p>),
    })
    await other
    await settle()
    for (const id of IDS)
      expect(page(id).querySelector('.canvas-generic-note')?.textContent).toContain('两份画法')
    since()
    await other.dispose()
    await settle()
    expect(since()).toEqual(Object.fromEntries(IDS.map(id => [id, 1])))
    expect(page('a').querySelector('.canvas-generic-note')).toBeNull()
  })
})
