// @vitest-environment happy-dom
import { cleanup, fireEvent, within } from '@testing-library/react'
import { partsOn } from '@omne-harness/shell-contract'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import {
  canvas,
  item,
  opened,
  pile,
  reread,
  screen,
  settle,
  type Opened,
} from './fixtures/canvas.tsx'

beforeAll(stubAnimation)
afterEach(cleanup)

const nameOn = (element: Element | null) => element?.getAttribute('data-omne-part')

/** The name on the nearest element above that carries one: the part it is drawn in. */
const drawnIn = (element: Element) =>
  nameOn(element.parentElement?.closest('[data-omne-part]') ?? null)

const surface = () => document.querySelector<HTMLElement>('.omne-paper-surface')!

/** `@` on the paper, with one taken thing to put back. */
async function find(world: Opened, taken: ReturnType<typeof item>) {
  surface().focus()
  fireEvent.keyDown(surface(), { key: '@', shiftKey: true })
  ;(await world.fake.next('look-away')).answer({
    outcome: 'succeeded',
    body: { items: [taken], next: null },
  })
  await settle()
}

describe('what a person sees on the back is a declared part, opened to tokens and style', () => {
  it('declares a page, a pile, the finder, the mark, the way home and the turn, each in the part it is drawn in', async () => {
    const world = await opened(canvas([]))
    const read = partsOn(world.shell.registry())
    if (read.kind !== 'read') throw new Error('the parts cannot be read')
    expect(read.conflicts).toEqual([])
    const declared = (name: string) => read.parts.find(part => part.name === name)
    expect(
      [
        'canvas.item',
        'canvas.pile',
        'canvas.finder',
        'canvas.mark',
        'canvas.home',
        'canvas.turn',
      ].map(name => {
        const part = declared(name)
        return [name, part?.label, part?.within, part?.depths]
      }),
    ).toEqual([
      ['canvas.item', '纸上的一页', 'canvas.paper', ['tokens', 'style']],
      ['canvas.pile', '一摞', 'canvas.paper', ['tokens', 'style']],
      ['canvas.finder', '查找', 'canvas.paper', ['tokens', 'style']],
      ['canvas.mark', '落点与找到的记号', 'canvas.paper', ['tokens', 'style']],
      ['canvas.home', '回正面的钮', 'canvas.paper', ['tokens', 'style']],
      ['canvas.turn', '「翻到正面」的记号', 'canvas.view', ['tokens', 'style']],
    ])
  })

  it('a page and a pile carry their names on their own roots, on the paper', async () => {
    await opened(canvas([item('a'), item('b', { pile: 'p' })], [pile('p')]))
    const page = document.querySelector('[data-item="a"]')!
    const heap = document.querySelector('[data-pile="p"]')!
    expect([nameOn(page), drawnIn(page)]).toEqual(['canvas.item', 'canvas.paper'])
    expect([nameOn(heap), drawnIn(heap)]).toEqual(['canvas.pile', 'canvas.paper'])
  })

  it('the way home sits on the paper, the turn on the view', async () => {
    await opened(canvas([]))
    const home = screen.getByRole('button', { name: '回到正面' })
    const turn = screen.getByRole('button', { name: '翻到正面' })
    expect([nameOn(home), drawnIn(home)]).toEqual(['canvas.home', 'canvas.paper'])
    expect([nameOn(turn), drawnIn(turn)]).toEqual(['canvas.turn', 'canvas.view'])
  })

  it('the finder, while open, and the mark on a thing it found, both on the paper', async () => {
    const lying = item('l', { at: { x: 200, y: 120 } })
    const world = await opened(canvas([lying]))
    await find(world, item('t', { state: 'off' }))
    const finder = screen.getByRole('dialog', { name: '查找' })
    expect([nameOn(finder), drawnIn(finder)]).toEqual(['canvas.finder', 'canvas.paper'])
    fireEvent.click(within(finder).getByRole('button', { name: /ref-t/u }))
    ;(await world.fake.next('place')).answer({ outcome: 'no-change', body: { item: lying } })
    await settle()
    await reread(world, canvas([lying]))
    const mark = document.querySelector('.canvas-found')!
    expect([nameOn(mark), drawnIn(mark)]).toEqual(['canvas.mark', 'canvas.paper'])
  })
})
