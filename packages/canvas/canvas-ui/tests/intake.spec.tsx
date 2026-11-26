// @vitest-environment happy-dom
import type { Context } from '@deepseek-ai/cordis'
import { act, cleanup, createEvent, fireEvent } from '@testing-library/react'
import type { KeyRender } from '@omne-harness/shell-contract'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { canvasIntake, type CanvasIntakeSubject } from '../src/cordis.ts'
import { INTAKE_STAYS_MS } from '../src/view/intake.tsx'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import {
  canvas,
  item,
  NOTE,
  opened,
  reread,
  screen,
  settle,
  type Opened,
} from './fixtures/canvas.tsx'

beforeAll(stubAnimation)
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const MEDIA = 'test.media'
const PNG = new File(['png'], 'a.png', { type: 'image/png' })
const PDF = new File(['pdf'], 'b.pdf', { type: 'application/pdf' })

/** An intake that draws the names of the files and hands its subject to the case. */
function taking(): { given: CanvasIntakeSubject[]; render: KeyRender<CanvasIntakeSubject> } {
  const given: CanvasIntakeSubject[] = []
  return {
    given,
    render: ({ subject }) => {
      given.push(subject)
      return <p className="taking">{subject.files.map(file => file.name).join(',')}</p>
    },
  }
}

async function put(root: Context, name: string, render: KeyRender<CanvasIntakeSubject>) {
  const fiber = root.plugin({
    name,
    inject: ['shell'],
    apply: ctx => void canvasIntake.put(ctx.shell, 'files', render),
  })
  await fiber
  await settle()
  return fiber
}

const surface = () => document.querySelector<HTMLElement>('.omne-paper-surface')!
const spot = () => document.querySelector<HTMLElement>('.canvas-intake')

async function drop(files: readonly File[], types: Record<string, string> = {}) {
  const event = createEvent.drop(surface(), {
    dataTransfer: { files, getData: (type: string) => types[type] ?? '' },
  })
  Object.defineProperties(event, { clientX: { value: 40 }, clientY: { value: 24 } })
  fireEvent(surface(), event)
  await settle()
}

const near = () => ({
  x: Number(spot()!.style.getPropertyValue('--omne-paper-x')),
  y: Number(spot()!.style.getPropertyValue('--omne-paper-y')),
})

async function answered(world: Opened, answer: unknown) {
  const call = await world.fake.next('place')
  call.answer(answer)
  await settle()
  await reread(world, canvas([]))
  const { tenant: _, canvas: __, ...body } = call.body as Record<string, unknown>
  return body
}

const placed = (ref: string) => ({
  outcome: 'succeeded',
  body: { revision: 2, item: item(ref, { reference: { kind: MEDIA, ref } }) },
})

describe('files dropped on the sheet go to the intake put on files', () => {
  it('drawn where they fell; each place is a place near there; after done() the spot goes', async () => {
    const world = await opened(canvas([]))
    const intake = taking()
    await put(world.root, 'media-ui', intake.render)
    await drop([PNG, PDF])
    expect(spot()?.getAttribute('data-omne-part')).toBe('canvas.mark')
    expect(spot()!.querySelector('.taking')?.textContent).toBe('a.png,b.pdf')
    const at = near()
    expect(at).toEqual({ x: 840, y: 472 })
    const subject = intake.given.at(-1)!
    act(() => subject.place({ kind: MEDIA, ref: 'one' }))
    act(() => subject.place({ kind: MEDIA, ref: 'two' }))
    expect(await answered(world, placed('one'))).toEqual({
      reference: { kind: MEDIA, ref: 'one' },
      near: at,
    })
    expect(await answered(world, placed('two'))).toEqual({
      reference: { kind: MEDIA, ref: 'two' },
      near: at,
    })
    vi.useFakeTimers({ shouldAdvanceTime: true })
    act(() => subject.done())
    expect(screen.getByRole('button', { name: '收起' })).toBeTruthy()
    act(() => void vi.advanceTimersByTime(INTAKE_STAYS_MS - 1))
    expect(spot()).not.toBeNull()
    act(() => void vi.advanceTimersByTime(1))
    expect(spot()).toBeNull()
  })

  it('a size given with a place goes with it, on the grid and inside the least and most size', async () => {
    const world = await opened(canvas([]))
    const intake = taking()
    await put(world.root, 'media-ui', intake.render)
    await drop([PNG, PDF])
    const at = near()
    const subject = intake.given.at(-1)!
    act(() => subject.place({ kind: MEDIA, ref: 'one' }, { size: { width: 176, height: 131 } }))
    expect(await answered(world, placed('one'))).toEqual({
      reference: { kind: MEDIA, ref: 'one' },
      near: at,
      size: { width: 176, height: 128 },
    })
    act(() => subject.place({ kind: MEDIA, ref: 'two' }, { size: { width: 900, height: 20 } }))
    expect(await answered(world, placed('two'))).toEqual({
      reference: { kind: MEDIA, ref: 'two' },
      near: at,
      size: { width: 320, height: 48 },
    })
    act(() => subject.place({ kind: MEDIA, ref: 'three' }, {}))
    expect(await answered(world, placed('three'))).toEqual({
      reference: { kind: MEDIA, ref: 'three' },
      near: at,
    })
  })

  it('one that did not go on the sheet says why and stays until it is closed', async () => {
    const world = await opened(canvas([]))
    const intake = taking()
    await put(world.root, 'media-ui', intake.render)
    await drop([PNG, PDF])
    const subject = intake.given.at(-1)!
    act(() => subject.place({ kind: MEDIA, ref: 'one' }))
    await answered(world, { outcome: 'conflict', body: { reason: 'full' } })
    act(() => subject.place({ kind: MEDIA, ref: 'two' }))
    await answered(world, placed('two'))
    vi.useFakeTimers({ shouldAdvanceTime: true })
    act(() => subject.done())
    act(() => void vi.advanceTimersByTime(INTAKE_STAYS_MS * 2))
    expect(spot()!.textContent).toContain('纸上摆满了，先拿走几样。')
    fireEvent.click(screen.getByRole('button', { name: '收起' }))
    expect(spot()).toBeNull()
  })

  it('a thing already on the sheet is pointed out', async () => {
    const lying = item('l', { reference: { kind: NOTE, ref: 'x' }, at: { x: 400, y: 200 } })
    const world = await opened(canvas([lying]))
    const intake = taking()
    await put(world.root, 'media-ui', intake.render)
    await drop([PNG])
    act(() => intake.given.at(-1)!.place(lying.reference))
    await answered(world, { outcome: 'no-change', body: { item: lying } })
    expect(document.querySelector('.canvas-found')).not.toBeNull()
  })

  it('what is dragged in that is not files is not taken', async () => {
    const world = await opened(canvas([]))
    await put(world.root, 'media-ui', taking().render)
    await drop([], { 'text/plain': 'hello' })
    expect(spot()).toBeNull()
  })
})

describe('when no intake can take them, one sentence says so', () => {
  it('nobody put one', async () => {
    await opened(canvas([]))
    await drop([PNG])
    expect(spot()!.textContent).toBe('这类东西现在放不上来。')
  })

  it('the one put throws', async () => {
    const world = await opened(canvas([]))
    const Broken = (): never => {
      throw new Error('cannot take')
    }
    const quiet = console.error
    console.error = () => undefined
    try {
      await put(world.root, 'media-ui', () => <Broken />)
      await drop([PNG])
    } finally {
      console.error = quiet
    }
    expect(spot()!.textContent).toBe('这类东西现在放不上来。')
  })

  it('two were put: both are named', async () => {
    const world = await opened(canvas([]))
    await put(world.root, 'media-ui', taking().render)
    await put(world.root, 'files-ui', taking().render)
    await drop([PNG])
    expect(spot()!.textContent).toMatch(
      /这类东西现在放不上来：有两份收法，互相冲突：files-ui、media-ui。/u,
    )
  })
})
