// @vitest-environment happy-dom
import { cleanup, fireEvent } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { CanvasPreferences } from '../src/index.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import {
  canvas,
  handle,
  item,
  memoryPreferences,
  opened,
  screen,
  settle,
  SHEET,
  type Opened,
} from './fixtures/canvas.tsx'

beforeAll(stubAnimation)
afterEach(cleanup)

const A = item('a', { at: { x: 80, y: 80 } })

function looked(): { x: number; y: number; zoom: number } {
  const lens = document.querySelector<HTMLElement>('.omne-paper-lens')!
  const read = (name: string) => Number(lens.style.getPropertyValue(name))
  return {
    x: read('--omne-paper-at-x'),
    y: read('--omne-paper-at-y'),
    zoom: read('--omne-paper-zoom'),
  }
}

async function landing(world: Opened): Promise<unknown> {
  fireEvent.pointerDown(handle('a'), { pointerId: 1, button: 0, clientX: 0, clientY: 0 })
  fireEvent.pointerMove(handle('a'), { pointerId: 1, clientX: 13, clientY: 22 })
  fireEvent.pointerUp(handle('a'), { pointerId: 1, clientX: 13, clientY: 22 })
  await settle()
  const sent = await world.fake.next('arrange')
  return (sent.body as { items: readonly { at: unknown }[] }).items[0]?.at
}

const magnet = () => screen.getByRole('button', { name: '磁吸' })
const CENTRE = { x: SHEET.width / 2, y: SHEET.height / 2, zoom: 1 }
const THROWING: CanvasPreferences = {
  read() {
    throw new Error('no store')
  },
  write() {
    throw new Error('full')
  },
}
const MEANINGLESS: CanvasPreferences = {
  read: name => (name === 'view' ? '{"x":"far"}' : 'sideways'),
  write: () => undefined,
}

describe('where this device looks, and its magnet, are kept through the port the application gives', () => {
  it('what was kept is where the sheet opens, and with the magnet off a landing goes out as it is', async () => {
    const { preferences } = memoryPreferences({
      view: JSON.stringify({ x: 300, y: 200, zoom: 1.5 }),
      magnet: 'off',
    })
    const world = await opened(canvas([A]), undefined, preferences)
    expect(looked()).toEqual({ x: 300, y: 200, zoom: 1.5 })
    expect(magnet().getAttribute('aria-pressed')).toBe('false')
    expect(await landing(world)).toEqual({ x: 89, y: 95 })
  })

  it('nothing kept: the middle of the sheet, near as it is, and the magnet on', async () => {
    const world = await opened(canvas([A]))
    expect(looked()).toEqual(CENTRE)
    expect(magnet().getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTitle('远近').textContent).toBe('100%')
    expect(await landing(world)).toEqual({ x: 96, y: 104 })
  })

  it('a change of the view or the magnet is written, and the readout follows the zoom', async () => {
    const { preferences, writes } = memoryPreferences()
    await opened(canvas([A]), undefined, preferences)
    const surface = screen.getByRole('region', { name: /^纸/u })
    surface.focus()
    fireEvent.keyDown(surface, { key: '=' })
    expect(looked().zoom).toBe(1.25)
    expect(writes.at(-1)).toEqual(['view', JSON.stringify({ ...CENTRE, zoom: 1.25 })])
    expect(screen.getByTitle('远近').textContent).toBe('125%')
    fireEvent.keyDown(surface, { key: '0' })
    expect(looked().zoom).toBe(1)
    fireEvent.click(magnet())
    expect(writes.at(-1)).toEqual(['magnet', 'off'])
    expect(magnet().getAttribute('aria-pressed')).toBe('false')
  })

  it.each<[string, CanvasPreferences]>([
    ['throws', THROWING],
    ['holds what it cannot mean', MEANINGLESS],
    ['holds what is not JSON', { read: () => 'not json', write: () => undefined }],
  ])('a port that %s: the defaults, and this time goes on', async (_, port) => {
    const world = await opened(canvas([A]), undefined, port)
    expect(looked()).toEqual(CENTRE)
    expect(magnet().getAttribute('aria-pressed')).toBe('true')
    const surface = screen.getByRole('region', { name: /^纸/u })
    fireEvent.keyDown(surface, { key: '=' })
    expect(looked().zoom).toBe(1.25)
    fireEvent.click(magnet())
    expect(magnet().getAttribute('aria-pressed')).toBe('false')
    expect(await landing(world)).toEqual({ x: 90, y: 98 })
  })
})
