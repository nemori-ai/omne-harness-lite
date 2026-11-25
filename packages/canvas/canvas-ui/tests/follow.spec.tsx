// @vitest-environment happy-dom
import { act, cleanup } from '@testing-library/react'
import { readTenantText } from '@omne-harness/public-contract'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import {
  canvas,
  item,
  NOTE_KIND,
  opened,
  page,
  placedAt,
  reread,
  screen,
  settle,
  TENANT,
} from './fixtures/canvas.tsx'

beforeAll(stubAnimation)
afterEach(cleanup)

const A = item('a')
const count = (calls: readonly { operation: string }[], operation: string) =>
  calls.filter(call => call.operation === operation).length
const wait = (ms: number) => act(() => new Promise(resolve => setTimeout(resolve, ms)))

describe('the canvas follows the server without the page being reloaded', () => {
  it('watches the changes of the tenant, and reads the canvas again on every frame', async () => {
    const world = await opened(canvas([A]))
    const [watch] = world.fake.observations
    expect(watch?.open).toEqual({ tenant: readTenantText(TENANT) })
    watch?.frame()
    await settle()
    await reread(
      world,
      canvas([{ ...A, at: { x: 400, y: 240 }, by: { kind: 'agent', session: 's' } }]),
    )
    expect(placedAt(page('a'))).toMatchObject({ x: 400, y: 240 })
    expect(page('a').querySelector('.canvas-said')?.textContent).toMatch(/^最近由 agent 摆放 · /u)
  })

  it('reads the kinds again when the keys the server makes public on canvas.kinds change, not otherwise', async () => {
    const world = await opened(canvas([A]))
    world.keys.set('canvas.kinds', ['test.note'])
    await settle()
    expect(count(world.fake.calls, 'kinds')).toBe(2)
    ;(await world.fake.next('kinds')).answer({ outcome: 'succeeded', body: { kinds: [] } })
    await settle()
    expect(page('a').querySelector('.canvas-generic-note')?.textContent).toBe('这一类现在没有声明')
    world.keys.touch()
    world.keys.set('canvas.kinds', ['test.note'])
    await settle()
    expect(count(world.fake.calls, 'kinds')).toBe(2)
    world.keys.set('canvas.kinds', ['test.note', 'media.object'])
    await settle()
    expect(count(world.fake.calls, 'kinds')).toBe(3)
    ;(await world.fake.next('kinds')).answer({
      outcome: 'succeeded',
      body: { kinds: [NOTE_KIND] },
    })
    await settle()
    expect(page('a').querySelector('.canvas-generic-note')).toBeNull()
  })

  it('a watch that ends says the sheet may be behind, comes back after a while, and reads again', async () => {
    const world = await opened(canvas([A]))
    world.fake.observations[0]?.end({ kind: 'unavailable' })
    await settle()
    expect(screen.getByRole('status').textContent).toContain('正在重连')
    expect(placedAt(page('a'))).toMatchObject({ x: 80, y: 80 })
    await wait(250)
    expect(world.fake.observations).toHaveLength(2)
    world.fake.observations[1]?.frame()
    await settle()
    await reread(world, canvas([A]))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('a watch the login may not keep is not retried, and the canvas is not drawn', async () => {
    const world = await opened(canvas([A]))
    world.fake.observations[0]?.end({ kind: 'ended', reason: 'denied' })
    await settle()
    expect(screen.getByText('没有权限看这张画布。')).toBeTruthy()
    expect(screen.queryByRole('region')).toBeNull()
    await wait(250)
    expect(world.fake.observations).toHaveLength(1)
  })

  it('the watch is let go when the back goes away', async () => {
    const world = await opened(canvas([A]))
    const [watch] = world.fake.observations
    world.view.unmount()
    expect(watch?.signal.aborted).toBe(true)
  })
})
