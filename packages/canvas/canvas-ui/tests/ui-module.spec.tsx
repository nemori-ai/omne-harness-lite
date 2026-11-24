// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { canvasProtocol } from '@omne-harness/canvas-protocol'
import { readTenantText } from '@omne-harness/public-contract'
import { partsOn } from '@omne-harness/shell-contract'
import { serveProtocol } from '@omne-harness/shell-contract/testing'
import { afterEach, beforeAll, expect, it } from 'vitest'
import type { CanvasClient } from '../src/index.ts'
import {
  CANVAS_APP_RENDER,
  CANVAS_ELEMENT,
  CANVAS_INTAKE,
  CANVAS_PICKER,
  canvasAppRender,
  canvasElement,
  canvasIntake,
  canvasPicker,
  canvasUiModule,
} from '../src/cordis.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import { startShell } from './fixtures/reference-shell.ts'

const OPERATIONS = Object.keys(canvasProtocol.operations)
const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const EMPTY = {
  sheet: { width: 1600, height: 900, grid: 8 },
  items: [],
  piles: [],
  revision: 0,
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const settle = () => act(tick)
const POINTS = [CANVAS_ELEMENT, CANVAS_PICKER, CANVAS_INTAKE, CANVAS_APP_RENDER]

beforeAll(stubAnimation)
afterEach(cleanup)

async function loaded() {
  const { root, shell } = await startShell()
  const fake = createFakeClient<CanvasClient>(OPERATIONS)
  const served = await serveProtocol(root, canvasProtocol, fake.client)
  await root.plugin(canvasUiModule)
  return { root, shell, fake, served }
}

function drawn(shell: Awaited<ReturnType<typeof loaded>>['shell'], scope: string | undefined) {
  const [item] = shell.items('back')
  if (item === undefined) throw new Error('nothing is on the back')
  return render(<>{item.render({ scope, turn: () => undefined })}</>)
}

it('canvas/v1 served: the canvas is on the back; withdrawn: the back is empty, so the application has one face', async () => {
  const { shell, served } = await loaded()
  expect(shell.items('back').map(item => item.id)).toEqual(['canvas'])
  expect(shell.adoption('canvas-ui')).toMatchObject({
    kind: 'adopted',
    bindings: { canvas: { key: 'canvas/v1' } },
  })
  await served.dispose()
  await tick()
  expect(shell.items('back')).toEqual([])
  expect(shell.conflicts('back')).toEqual([])
})

it('no canvas/v1 at all: nothing is put on the back', async () => {
  const { root, shell } = await startShell()
  await root.plugin(canvasUiModule)
  expect(shell.items('back')).toEqual([])
})

it('no tenant yet: nothing is drawn and nothing is read', async () => {
  const { shell, fake } = await loaded()
  const view = drawn(shell, undefined)
  expect(view.container.textContent).toBe('')
  expect(fake.calls).toEqual([])
})

it('the canvas is read from the main canvas of the tenant, its kinds too; while reading it says so', async () => {
  const { shell, fake } = await loaded()
  drawn(shell, TENANT)
  expect(screen.getByRole('status', { name: '正在读画布……' })).toBeTruthy()
  expect(screen.queryByRole('img')).toBeNull()
  const look = await fake.next('look')
  const kinds = await fake.next('kinds')
  expect(look.body).toEqual({ tenant: readTenantText(TENANT), canvas: 'main' })
  expect(kinds.body).toEqual({ tenant: readTenantText(TENANT) })
})

it('an empty canvas is drawn as a sheet as wide and high as the server says, the size step applied', async () => {
  const { shell, fake } = await loaded()
  drawn(shell, TENANT)
  ;(await fake.next('look')).answer({ outcome: 'succeeded', body: EMPTY })
  ;(await fake.next('kinds')).answer({ outcome: 'succeeded', body: { kinds: [] } })
  await settle()
  const paper = screen.getByRole('img', { name: '纸，宽 1600，高 900' })
  expect(paper.style.width).toBe('calc(1600px * var(--omne-size))')
  expect(paper.style.height).toBe('calc(900px * var(--omne-size))')
  expect(screen.queryByRole('status')).toBeNull()
})

it('a canvas that cannot be read now says so and is not drawn as an empty sheet; trying again reads it again', async () => {
  const { shell, fake } = await loaded()
  drawn(shell, TENANT)
  ;(await fake.next('look')).answer({ outcome: 'basis-unavailable' })
  await settle()
  expect(screen.getByText('现在读不到画布。')).toBeTruthy()
  expect(screen.queryByRole('img')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  ;(await fake.next('look')).answer({ outcome: 'succeeded', body: EMPTY })
  await settle()
  expect(screen.getByRole('img', { name: '纸，宽 1600，高 900' })).toBeTruthy()
})

it('a read that never arrives is not readable now either, and a refusal says it is refused', async () => {
  const thrown = await loaded()
  const failing = { ...thrown.fake.client, look: () => Promise.reject(new Error('gone')) }
  const { root, shell } = await startShell()
  await serveProtocol(root, canvasProtocol, failing)
  await root.plugin(canvasUiModule)
  drawn(shell, TENANT)
  await settle()
  expect(screen.getByText('现在读不到画布。')).toBeTruthy()
  cleanup()
  drawn(thrown.shell, TENANT)
  ;(await thrown.fake.next('look')).answer({ outcome: 'denied' })
  await settle()
  expect(screen.getByText('没有权限看这张画布。')).toBeTruthy()
  expect(screen.queryByRole('img')).toBeNull()
})

it('declares the four client points in the catalog, each taking drawings by key', async () => {
  const { shell } = await loaded()
  const declared = shell.described().points.map(point => point.name)
  for (const point of POINTS) {
    expect(declared).toContain(point)
    expect(shell.takesDrawing(point)).toBe(true)
  }
  expect([canvasElement, canvasPicker, canvasIntake, canvasAppRender].map(p => p.name)).toEqual(
    POINTS,
  )
})

it('the points are declared even while canvas/v1 is not served, so a plugin can still put on them', async () => {
  const { root, shell } = await startShell()
  await root.plugin(canvasUiModule)
  for (const point of POINTS) expect(shell.takesDrawing(point)).toBe(true)
})

it('the kinds of canvas.element and canvas.picker are the kinds the server declares; intake and apps take any key', () => {
  let declared: readonly string[] | undefined = ['session.session']
  const server = { keys: (point: string) => (point === 'canvas.kinds' ? declared : []) }
  for (const point of [canvasElement, canvasPicker]) {
    expect(point.keys(server)).toEqual({ kind: 'told', keys: ['session.session'] })
  }
  declared = undefined
  expect(canvasElement.keys(server)).toEqual({ kind: 'unavailable' })
  expect(canvasIntake.keys(server)).toEqual({ kind: 'any' })
  expect(canvasAppRender.keys(server)).toEqual({ kind: 'any' })
})

it('declares its two parts under the whole application', async () => {
  const { shell } = await loaded()
  const read = partsOn(shell.registry())
  expect(read.kind === 'read' && read.conflicts).toEqual([])
  expect(read.kind === 'read' && read.parts.map(part => [part.name, part.within])).toEqual([
    ['canvas.paper', 'canvas.view'],
    ['canvas.view', 'shell.app'],
  ])
})
