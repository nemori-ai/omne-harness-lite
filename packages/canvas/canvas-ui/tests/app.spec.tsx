// @vitest-environment happy-dom
import type { Context } from '@deepseek-ai/cordis'
import { cleanup, within } from '@testing-library/react'
import type { KeyRender } from '@omne-harness/shell-contract'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { canvasAppRender, type CanvasAppSubject } from '../src/cordis.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { canvas, item, NOTE_KIND, opened, page, settle } from './fixtures/canvas.tsx'

beforeAll(stubAnimation)
afterEach(cleanup)

const APP_KIND = { ...NOTE_KIND, name: 'canvas.app', label: '小应用' }
const app = (id: string, name: string, x = 80) =>
  item(id, { reference: { kind: 'canvas.app', ref: name }, at: { x, y: 80 } })

const drawing =
  (word: string): KeyRender<CanvasAppSubject> =>
  ({ subject }) => <p>{`${word}:${subject.name}`}</p>

async function put(root: Context, name: string, app: string, render: KeyRender<CanvasAppSubject>) {
  const fiber = root.plugin({
    name,
    inject: ['shell'],
    apply: ctx => void canvasAppRender.put(ctx.shell, app, render),
  })
  await fiber
  await settle()
  return fiber
}

const said = (id: string) =>
  Array.from(page(id).querySelectorAll('.canvas-generic-note')).map(note => note.textContent)

describe('a canvas app on the sheet is drawn by the drawing put under its name', () => {
  it('given its name; taken back, the page says the app is not here now', async () => {
    const world = await opened(canvas([app('a', 'clock')]), [APP_KIND])
    const fiber = await put(world.root, 'clock-plugin', 'clock', drawing('clock'))
    expect(within(page('a')).getByText('clock:clock')).toBeTruthy()
    await fiber.dispose()
    await settle()
    expect(said('a')).toEqual(['这个小应用现在不在'])
    expect(page('a').querySelector('.canvas-generic-ref')?.textContent).toBe('clock')
  })

  it('two drawings under one name: the page names both; one taken back, the other draws', async () => {
    const world = await opened(canvas([app('a', 'clock')]), [APP_KIND])
    await put(world.root, 'clock-plugin', 'clock', drawing('one'))
    const second = await put(world.root, 'other-plugin', 'clock', drawing('two'))
    expect(said('a')).toEqual([
      '这个小应用现在不在',
      '这个名字有两份，互相冲突：clock-plugin、other-plugin',
    ])
    await second.dispose()
    await settle()
    expect(within(page('a')).getByText('one:clock')).toBeTruthy()
  })

  it('an app that throws while it draws falls back alone', async () => {
    const world = await opened(canvas([app('a', 'broken'), app('b', 'clock', 600)]), [APP_KIND])
    const Broken = (): never => {
      throw new Error('cannot draw')
    }
    const quiet = console.error
    console.error = () => undefined
    try {
      await put(world.root, 'broken-plugin', 'broken', () => <Broken />)
      await put(world.root, 'clock-plugin', 'clock', drawing('clock'))
    } finally {
      console.error = quiet
    }
    expect(said('a')).toEqual(['这个小应用现在不在'])
    expect(within(page('b')).getByText('clock:clock')).toBeTruthy()
  })
})
