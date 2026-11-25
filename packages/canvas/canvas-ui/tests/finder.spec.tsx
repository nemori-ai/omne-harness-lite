// @vitest-environment happy-dom
import type { Context } from '@deepseek-ai/cordis'
import { cleanup, fireEvent, within } from '@testing-library/react'
import type { CanvasItemBody } from '@omne-harness/canvas-protocol'
import type { KeyRender } from '@omne-harness/shell-contract'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { canvasPicker, type CanvasPickerSubject } from '../src/cordis.ts'
import { BELOW_MIDDLE } from '../src/view/sheet-layers.tsx'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import {
  canvas,
  item,
  NOTE,
  NOTE_KIND,
  opened,
  reread,
  screen,
  settle,
  type Opened,
} from './fixtures/canvas.tsx'

beforeAll(stubAnimation)
afterEach(cleanup)

const CARD = 'test.card'
const CARD_KIND = { ...NOTE_KIND, name: CARD, label: '卡片' }
const KINDS = [NOTE_KIND, CARD_KIND]
/** Nothing was kept on this device: the view is the middle of the 1600 × 900 sheet, the finder opens below it. */
const MIDDLE = { x: 800, y: 450 + BELOW_MIDDLE }

const picker =
  (word: string, kind: string): KeyRender<CanvasPickerSubject> =>
  ({ subject }) => (
    <button type="button" onClick={() => subject.pick({ kind, ref: `${word}-${subject.query}` })}>
      {`${word}:${subject.query}`}
    </button>
  )

async function put(
  root: Context,
  name: string,
  kind: string,
  render: KeyRender<CanvasPickerSubject>,
) {
  const fiber = root.plugin({
    name,
    inject: ['shell'],
    apply: ctx => void canvasPicker.put(ctx.shell, kind, render),
  })
  await fiber
  await settle()
  return fiber
}

const surface = () => document.querySelector<HTMLElement>('.omne-paper-surface')!
const finder = () => screen.queryByRole('dialog', { name: '查找' })
const line = () => within(finder()!).getByRole('textbox')
const group = (label: string) => within(finder()!).queryByRole('group', { name: label })

/** `@` pressed with the focus on the paper, and the first page of what was taken answered as given. */
async function find(
  world: Opened,
  away: Readonly<{ items: readonly CanvasItemBody[]; next: number | null }> = {
    items: [],
    next: null,
  },
) {
  surface().focus()
  fireEvent.keyDown(surface(), { key: '@', shiftKey: true })
  ;(await world.fake.next('look-away')).answer({ outcome: 'succeeded', body: away })
  await settle()
}

const bodyOf = (call: { body: unknown }) => {
  const { tenant: _, canvas: __, ...rest } = call.body as Record<string, unknown>
  return rest
}

async function placing(world: Opened, answer: unknown, after = canvas([])) {
  const call = await world.fake.next('place')
  call.answer(answer)
  await settle()
  await reread(world, after)
  return bodyOf(call)
}

describe('the finder lists what each kind lets a person pick, a group a kind', () => {
  it('opens where it was asked, each picker given the words written on the line', async () => {
    const world = await opened(canvas([]), KINDS)
    await put(world.root, 'notes-ui', NOTE, picker('note', NOTE))
    await put(world.root, 'cards-ui', CARD, picker('card', CARD))
    await find(world)
    expect(document.activeElement).toBe(line())
    expect(line().dataset['variant']).toBe('line')
    fireEvent.change(line(), { target: { value: 'tea' } })
    expect(within(group('便签')!).getByRole('button').textContent).toBe('note:tea')
    expect(within(group('卡片')!).getByRole('button').textContent).toBe('card:tea')
  })

  it('a pick is placed near where the finder opened; done, the finder closes', async () => {
    const world = await opened(canvas([]), KINDS)
    await put(world.root, 'notes-ui', NOTE, picker('note', NOTE))
    await find(world)
    fireEvent.click(within(group('便签')!).getByRole('button'))
    const placed = item('n', { reference: { kind: NOTE, ref: 'note-' } })
    expect(
      await placing(
        world,
        { outcome: 'succeeded', body: { revision: 2, item: placed } },
        canvas([placed]),
      ),
    ).toEqual({
      reference: { kind: NOTE, ref: 'note-' },
      near: MIDDLE,
    })
    expect(finder()).toBeNull()
  })

  it('a pick may give a size: it goes with the place, on the grid', async () => {
    const world = await opened(canvas([]), KINDS)
    const sized: KeyRender<CanvasPickerSubject> = ({ subject }) => (
      <button
        type="button"
        onClick={() =>
          subject.pick({ kind: NOTE, ref: 'big' }, { size: { width: 203, height: 99 } })
        }
      >
        big
      </button>
    )
    await put(world.root, 'notes-ui', NOTE, sized)
    await find(world)
    fireEvent.click(within(group('便签')!).getByRole('button'))
    const placed = item('n', { reference: { kind: NOTE, ref: 'big' } })
    expect(
      await placing(
        world,
        { outcome: 'succeeded', body: { revision: 2, item: placed } },
        canvas([placed]),
      ),
    ).toEqual({
      reference: { kind: NOTE, ref: 'big' },
      near: MIDDLE,
      size: { width: 200, height: 96 },
    })
  })

  it('a pick lying there already is pointed out: the view goes to it, it is marked, the finder closes', async () => {
    const lying = item('l', { reference: { kind: NOTE, ref: 'note-' }, at: { x: 200, y: 120 } })
    const world = await opened(canvas([lying]), KINDS)
    await put(world.root, 'notes-ui', NOTE, picker('note', NOTE))
    await find(world)
    fireEvent.click(within(group('便签')!).getByRole('button'))
    await placing(world, { outcome: 'no-change', body: { item: lying } }, canvas([lying]))
    expect(finder()).toBeNull()
    const lens = document.querySelector<HTMLElement>('.omne-paper-lens')!
    expect(lens.style.getPropertyValue('--omne-paper-at-x')).toBe('300')
    expect(lens.style.getPropertyValue('--omne-paper-at-y')).toBe('191')
    const mark = document.querySelector<HTMLElement>('.canvas-found')!
    expect([mark.style.width, mark.style.height]).toEqual(['200px', '142px'])
  })

  it('a pick the canvas will not take says why, and the finder stays open', async () => {
    const world = await opened(canvas([]), KINDS)
    await put(world.root, 'notes-ui', NOTE, picker('note', NOTE))
    await find(world)
    fireEvent.click(within(group('便签')!).getByRole('button'))
    await placing(world, { outcome: 'conflict', body: { reason: 'full' } })
    expect(finder()).not.toBeNull()
    expect(within(finder()!).getByRole('status').textContent).toContain('纸上摆满了，先拿走几样。')
    fireEvent.click(within(group('便签')!).getByRole('button'))
    await placing(world, { outcome: 'conflict', body: { reason: 'kind-undeclared' } })
    expect(within(finder()!).getByRole('status').textContent).toContain('这一类现在没有声明。')
  })

  it('a kind whose picker throws has no group; the others are drawn', async () => {
    const world = await opened(canvas([]), KINDS)
    await put(world.root, 'notes-ui', NOTE, () => {
      throw new Error('cannot pick')
    })
    const Broken = (): never => {
      throw new Error('cannot pick')
    }
    const quiet = console.error
    console.error = () => undefined
    try {
      await put(world.root, 'cards-ui', CARD, () => <Broken />)
      await find(world)
    } finally {
      console.error = quiet
    }
    expect(group('便签')).toBeNull()
    expect(group('卡片')).toBeNull()
    expect(group('拿走了的')).not.toBeNull()
  })

  it('a kind nobody put a picker on has no group; two pickers on one kind name both', async () => {
    const world = await opened(canvas([]), KINDS)
    await put(world.root, 'notes-ui', NOTE, picker('one', NOTE))
    await put(world.root, 'more-notes-ui', NOTE, picker('two', NOTE))
    await find(world)
    expect(group('卡片')).toBeNull()
    expect(group('便签')!.textContent).toMatch(
      /这一类有两份挑法，互相冲突：.*notes-ui、.*notes-ui/u,
    )
    expect(within(group('便签')!).queryByRole('button')).toBeNull()
  })
})

describe('what was taken is in the finder too, and a row puts it back', () => {
  const taken = (id: string, ref: string) =>
    item(id, { state: 'off', reference: { kind: NOTE, ref } })

  it('reads the taken a page at a time, on while too few match the words, and puts the row picked back', async () => {
    const world = await opened(canvas([]), KINDS)
    await find(world, { items: [taken('t1', 'tea'), taken('t2', 'map')], next: 2 })
    const second = await world.fake.next('look-away')
    expect(bodyOf(second)).toEqual({ limit: 20, before: 2 })
    second.answer({ outcome: 'succeeded', body: { items: [taken('t0', 'Teapot')], next: null } })
    await settle()
    fireEvent.change(line(), { target: { value: ' TEA ' } })
    const rows = within(group('拿走了的')!).getAllByRole('button')
    expect(rows.map(row => row.dataset['away'])).toEqual(['t1', 't0'])
    fireEvent.change(line(), { target: { value: '便签 map' } })
    fireEvent.click(within(group('拿走了的')!).getByRole('button'))
    expect(
      await placing(world, {
        outcome: 'succeeded',
        body: { revision: 3, item: taken('t2', 'map') },
      }),
    ).toEqual({
      reference: { kind: NOTE, ref: 'map' },
      near: MIDDLE,
    })
    expect(finder()).toBeNull()
  })

  it('says when nothing was taken, when nothing matches, and when the taken cannot be read', async () => {
    const world = await opened(canvas([]), KINDS)
    await find(world)
    expect(group('拿走了的')!.textContent).toContain('还没有拿走过东西。')
    fireEvent.change(line(), { target: { value: 'x' } })
    expect(group('拿走了的')!.textContent).toContain('拿走了的里没有「x」。')
    fireEvent.keyDown(line(), { key: 'Escape' })
    surface().focus()
    fireEvent.keyDown(surface(), { key: '@' })
    ;(await world.fake.next('look-away')).answer({ outcome: 'denied' })
    await settle()
    expect(group('拿走了的')!.textContent).toContain('没有权限看拿走了的东西。')
  })
})

describe('the finder with the keyboard only', () => {
  it('opens from the paper with @, walks the rows with ↑ ↓, picks with Enter, and Escape gives the focus back', async () => {
    const world = await opened(canvas([]), KINDS)
    await put(world.root, 'notes-ui', NOTE, picker('note', NOTE))
    await find(world, {
      items: [item('t', { state: 'off', reference: { kind: NOTE, ref: 'tea' } })],
      next: null,
    })
    fireEvent.keyDown(line(), { key: 'ArrowDown' })
    expect(document.activeElement?.textContent).toBe('note:')
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect((document.activeElement as HTMLElement).dataset['away']).toBe('t')
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' })
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(line())
    fireEvent.keyDown(line(), { key: 'Enter' })
    await placing(world, { outcome: 'conflict', body: { reason: 'not-admitted' } })
    expect(within(finder()!).getByRole('status').textContent).toContain('它的拥有者没有接受它。')
    fireEvent.keyDown(line(), { key: 'Escape' })
    expect(finder()).toBeNull()
    expect(document.activeElement).toBe(surface())
  })

  it('the finder on the paper is a control too, and @ written in a field is only a character', async () => {
    const world = await opened(canvas([]), KINDS)
    const button = screen.getByRole('button', { name: '查找' })
    expect(button.getAttribute('aria-keyshortcuts')).toBe('@')
    fireEvent.click(button)
    ;(await world.fake.next('look-away')).answer({
      outcome: 'succeeded',
      body: { items: [], next: null },
    })
    await settle()
    fireEvent.keyDown(line(), { key: 'Escape' })
    expect(document.activeElement).toBe(button)
    const field = document.body.appendChild(document.createElement('input'))
    field.focus()
    fireEvent.keyDown(field, { key: '@' })
    expect(finder()).toBeNull()
    expect(world.fake.calls.filter(call => call.operation === 'look-away')).toHaveLength(1)
    field.remove()
  })
})
