// @vitest-environment happy-dom
import type { Context } from '@deepseek-ai/cordis'
import { cleanup, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { canvasElement, type CanvasElementSubject } from '../src/cordis.ts'
import { tenantScope, type KeyRender } from '@omne-harness/shell-contract'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { canvas, item, NOTE, NOTE_KIND, opened, page, settle } from './fixtures/canvas.tsx'

beforeAll(stubAnimation)
afterEach(cleanup)

const NOTE_A = item('a')
const OTHER = 'test.other'
const NOTE_B = item('b', { reference: { kind: OTHER, ref: 'ref-b' }, at: { x: 600, y: 80 } })
const OTHER_KIND = { ...NOTE_KIND, name: OTHER, label: '另一类' }

const say =
  (word: string): KeyRender<CanvasElementSubject> =>
  ({ subject }) => <p>{`${word}:${subject.reference.ref}:${subject.frame}`}</p>

async function put(
  root: Context,
  name: string,
  kind: string,
  render: KeyRender<CanvasElementSubject>,
) {
  const fiber = root.plugin({
    name,
    inject: ['shell'],
    apply: ctx => void canvasElement.put(ctx.shell, kind, render),
  })
  await fiber
  await settle()
  return fiber
}

const note = (id: string) => page(id).querySelector('.canvas-generic-note')?.textContent ?? null
const standing = (id: string) =>
  page(id).querySelector<HTMLElement>('[data-standing]')?.dataset['standing'] ?? null

describe('a thing is drawn by the drawing put on its kind', () => {
  it('given the reference and that it lies on the sheet', async () => {
    const world = await opened(canvas([NOTE_A]))
    await put(world.root, 'notes-ui', NOTE, say('note'))
    expect(within(page('a')).getByText('note:ref-a:sheet')).toBeTruthy()
  })

  it('with nobody putting one, a declared kind is the generic page: its name and the reference', async () => {
    await opened(canvas([NOTE_A]))
    expect(standing('a')).toBe('declared')
    expect(page('a').querySelector('.canvas-generic-kind')?.textContent).toBe('便签')
    expect(page('a').querySelector('.canvas-generic-ref')?.textContent).toBe('ref-a')
    expect(note('a')).toBeNull()
  })
})

describe('what the canvas cannot draw has its own look each; none is empty, none stands for another', () => {
  it('a kind the kinds were read without is not declared now, even with a drawing put on it', async () => {
    const world = await opened(canvas([NOTE_A]), [])
    await put(world.root, 'notes-ui', NOTE, say('note'))
    expect(standing('a')).toBe('undeclared')
    expect(note('a')).toBe('这一类现在没有声明')
    expect(page('a').querySelector('.canvas-generic-kind')?.textContent).toBe(NOTE)
  })

  it('kinds that cannot be read are a basis that cannot be had', async () => {
    await opened(canvas([NOTE_A]), 'unreadable')
    expect(standing('a')).toBe('unreadable')
    expect(note('a')).toBe('现在读不到')
  })

  it('a kind the server lists as declared twice is a basis that cannot be had too', async () => {
    await opened(canvas([NOTE_A]), [{ kind: 'conflict', name: NOTE, by: ['x-row', 'y-row'] }])
    expect(standing('a')).toBe('unreadable')
    expect(note('a')).toBe('现在读不到')
  })

  it('two drawings on one kind: the generic page names both; one taken back, the other draws at once', async () => {
    const world = await opened(canvas([NOTE_A]))
    await put(world.root, 'notes-ui', NOTE, say('one'))
    const second = await put(world.root, 'more-notes-ui', NOTE, say('two'))
    expect(standing('a')).toBe('declared')
    expect(note('a')).toMatch(
      /这一类有两份画法，互相冲突：.*notes-ui.*、.*more-notes-ui|more-notes-ui.*、.*notes-ui/u,
    )
    await second.dispose()
    await settle()
    expect(within(page('a')).getByText('one:ref-a:sheet')).toBeTruthy()
    expect(note('a')).toBeNull()
  })

  it('drawings another tenant put are no conflict here: a throwing drawing of ours is only generic', async () => {
    const world = await opened(canvas([NOTE_A]))
    const elsewhere = tenantScope(
      '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000002"}',
    )
    const theirs = (name: string) =>
      world.root.plugin({
        name,
        inject: ['shell'],
        apply: ctx => void canvasElement.put(ctx.shell, NOTE, say(name), elsewhere),
      })
    await theirs('theirs-one')
    await theirs('theirs-two')
    await put(world.root, 'notes-ui', NOTE, () => {
      throw new Error('cannot draw')
    })
    expect(page('a').querySelector('.canvas-generic-ref')?.textContent).toBe('ref-a')
    expect(note('a')).toBeNull()
  })

  it('a drawing that throws while it renders falls back on its own thing only', async () => {
    const world = await opened(canvas([NOTE_A, NOTE_B]), [NOTE_KIND, OTHER_KIND])
    const Broken = (): never => {
      throw new Error('cannot draw')
    }
    const quiet = console.error
    console.error = () => undefined
    try {
      await put(world.root, 'notes-ui', NOTE, () => <Broken />)
      await put(world.root, 'others-ui', OTHER, say('other'))
    } finally {
      console.error = quiet
    }
    expect(standing('a')).toBe('declared')
    expect(page('a').querySelector('.canvas-generic-ref')?.textContent).toBe('ref-a')
    expect(within(page('b')).getByText('other:ref-b:sheet')).toBeTruthy()
  })
})
