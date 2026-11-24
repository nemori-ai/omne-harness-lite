import { canvasProtocol } from '@omne-harness/canvas-protocol'
import { readTenantText } from '@omne-harness/public-contract'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CanvasDriver, type Schedule } from '../src/model/canvas-driver.ts'
import type { CanvasClient } from '../src/model/reading.ts'
import { createFakeClient } from './fixtures/fake-client.ts'

const TENANT = readTenantText(
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}',
)
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const body = (revision: number) => ({ sheet: {}, items: [], piles: [], revision })

/** A schedule the case runs by hand; it keeps what was asked of it and whether it was taken back. */
function hand() {
  const asked: { delayMs: number; run: () => void; cancelled: boolean }[] = []
  const schedule: Schedule = (delayMs, run) => {
    const one = { delayMs, run, cancelled: false }
    asked.push(one)
    return () => {
      one.cancelled = true
    }
  }
  return { asked, schedule }
}

function driven(schedule?: Schedule) {
  const fake = createFakeClient<CanvasClient>(Object.keys(canvasProtocol.operations))
  const driver = new CanvasDriver({
    client: fake.client,
    tenant: TENANT,
    ...(schedule === undefined ? {} : { schedule }),
  })
  let told = 0
  driver.subscribe(() => (told += 1))
  return { fake, driver, told: () => told }
}

async function started(schedule?: Schedule) {
  const world = driven(schedule)
  world.driver.start()
  ;(await world.fake.next('look')).answer({ outcome: 'succeeded', body: body(1) })
  ;(await world.fake.next('kinds')).answer({ outcome: 'succeeded', body: { kinds: [] } })
  await tick()
  return world
}

afterEach(() => {
  vi.useRealTimers()
})

describe('starting to follow the canvas', () => {
  it('follows, reads the canvas and the kinds, and watches once, however often it is started', async () => {
    const world = driven()
    world.driver.start()
    expect(world.driver.getState().live).toBe('on')
    world.driver.start()
    const asked = world.fake.calls.map(call => call.operation).sort()
    expect(asked).toEqual(['kinds', 'look'])
    expect(world.fake.observations).toHaveLength(1)
  })

  it('does not start once it is let go', () => {
    const world = driven()
    world.driver.dispose()
    world.driver.start()
    expect(world.fake.calls).toEqual([])
    expect(world.fake.observations).toEqual([])
    expect(world.driver.getState().live).toBe('off')
  })
})

describe('reads of the canvas', () => {
  it('a read answered after a later one is not drawn over the later one', async () => {
    const world = driven()
    void world.driver.reread()
    void world.driver.reread()
    const [first, second] = world.fake.calls
    second?.answer({ outcome: 'succeeded', body: body(2) })
    await tick()
    first?.answer({ outcome: 'succeeded', body: body(1) })
    await tick()
    expect(world.driver.getState().look).toEqual({ kind: 'read', value: body(2) })
  })

  it('a frame while following tells no one until the read it asks for lands', async () => {
    const world = await started()
    const before = world.driver.getState()
    const told = world.told()
    world.fake.observations[0]?.frame()
    await tick()
    expect(world.told()).toBe(told)
    expect(world.driver.getState()).toBe(before)
    ;(await world.fake.next('look')).answer({ outcome: 'succeeded', body: body(3) })
    await tick()
    expect(world.driver.getState().look).toEqual({ kind: 'read', value: body(3) })
  })
})

describe('when the watch ends', () => {
  it.each([
    ['ended because it may not be kept', { kind: 'ended', reason: 'denied' } as const],
    ['refused', { kind: 'refused', outcome: 'denied' } as const],
  ])('a watch %s is not tried again, and the canvas is refused', async (_, end) => {
    const time = hand()
    const world = await started(time.schedule)
    world.fake.observations[0]?.end(end)
    await tick()
    expect(world.driver.getState()).toMatchObject({
      live: 'denied',
      look: { kind: 'unreadable', reason: 'denied' },
    })
    expect(time.asked).toEqual([])
  })

  it.each([
    ['ended for another reason', { kind: 'ended', reason: 'unavailable' } as const],
    ['refused for another reason', { kind: 'refused', outcome: 'unavailable' } as const],
    ['unavailable', { kind: 'unavailable' } as const],
  ])('a watch %s is tried again after a while', async (_, end) => {
    const time = hand()
    const world = await started(time.schedule)
    world.fake.observations[0]?.end(end)
    await tick()
    expect(world.driver.getState().live).toBe('retrying')
    expect(world.driver.getState().look.kind).toBe('read')
    expect(time.asked.map(one => one.delayMs)).toEqual([200])
  })

  it('a watch that breaks is tried again, not refused', async () => {
    const time = hand()
    const world = await started(time.schedule)
    world.fake.observations[0]?.fail()
    await tick()
    expect(world.driver.getState().live).toBe('retrying')
    expect(time.asked).toHaveLength(1)
  })

  it('waits longer each time in a row, and from the start again once a frame comes', async () => {
    const time = hand()
    const world = await started(time.schedule)
    world.fake.observations[0]?.end({ kind: 'unavailable' })
    await tick()
    time.asked[0]?.run()
    world.fake.observations[1]?.end({ kind: 'unavailable' })
    await tick()
    time.asked[1]?.run()
    expect(world.fake.observations).toHaveLength(3)
    world.fake.observations[2]?.frame()
    await tick()
    expect(world.driver.getState().live).toBe('on')
    world.fake.observations[2]?.end({ kind: 'unavailable' })
    await tick()
    expect(time.asked.map(one => one.delayMs)).toEqual([200, 400, 200])
  })
})

describe('commands', () => {
  it('a command that is done clears what the one before said', async () => {
    const world = await started()
    void world.driver.send({ op: 'take', body: { items: ['a'] } })
    ;(await world.fake.next('take')).answer({ outcome: 'conflict', body: { reason: 'locked' } })
    ;(await world.fake.next('look')).answer({ outcome: 'succeeded', body: body(2) })
    await tick()
    expect(world.driver.getState().notice).toBe('它锁着，先解开才能动。')
    void world.driver.send({ op: 'take', body: { items: ['a'] } })
    await tick()
    expect(world.driver.getState().notice).toBeUndefined()
    ;(await world.fake.next('take')).answer({ outcome: 'succeeded', body: {} })
    ;(await world.fake.next('look')).answer({ outcome: 'succeeded', body: body(3) })
    await tick()
    expect(world.driver.getState().notice).toBeUndefined()
  })

  it('what was said can be put away', async () => {
    const world = await started()
    void world.driver.send({ op: 'take', body: { items: ['a'] } })
    ;(await world.fake.next('take')).answer({ outcome: 'denied' })
    ;(await world.fake.next('look')).answer({ outcome: 'succeeded', body: body(2) })
    await tick()
    expect(world.driver.getState().notice).toBe('没有权限改这张画布。')
    world.driver.dismiss()
    expect(world.driver.getState().notice).toBeUndefined()
  })

  it('a place without a size asks for none', async () => {
    const world = await started()
    const reference = { kind: 'test.note', ref: 'r' }
    void world.driver.place(reference, { x: 8, y: 8 })
    const call = await world.fake.next('place')
    expect('size' in call.body).toBe(false)
    expect(call.body).toMatchObject({ reference, near: { x: 8, y: 8 } })
  })
})

describe('the taken records', () => {
  it('are read from the newest unless a page says where to read on from', async () => {
    const world = driven()
    void world.driver.lookAway(10)
    void world.driver.lookAway(10, 5)
    const [first, second] = world.fake.calls
    expect('before' in (first?.body ?? {})).toBe(false)
    expect(first?.body).toMatchObject({ limit: 10, canvas: 'main' })
    expect(second?.body).toMatchObject({ limit: 10, before: 5 })
  })
})

describe('letting go', () => {
  it('a driver never started can be let go', () => {
    expect(() => driven().driver.dispose()).not.toThrow()
  })

  it('sends nothing, tells no one and tries no watch again once it is let go', async () => {
    const time = hand()
    const world = await started(time.schedule)
    const told = world.told()
    world.driver.dispose()
    await tick()
    void world.driver.send({ op: 'take', body: { items: ['a'] } })
    const placed = await world.driver.place({ kind: 'test.note', ref: 'r' }, { x: 0, y: 0 })
    void world.driver.reread()
    world.driver.rereadKinds()
    await tick()
    expect(placed).toEqual({ kind: 'not', why: expect.any(String) })
    expect(
      world.fake.calls.map(call => call.operation).filter(op => op !== 'look' && op !== 'kinds'),
    ).toEqual([])
    expect(time.asked).toEqual([])
    expect(world.told()).toBe(told)
  })

  it('a command in flight when it is let go tells no one when its answer comes', async () => {
    const world = await started()
    void world.driver.send({ op: 'take', body: { items: ['a'] } })
    const take = await world.fake.next('take')
    const told = world.told()
    world.driver.dispose()
    take.answer({ outcome: 'denied' })
    ;(await world.fake.next('look')).answer({ outcome: 'succeeded', body: body(2) })
    await tick()
    expect(world.told()).toBe(told)
    expect(world.driver.getState().notice).toBeUndefined()
  })

  it('a wait to watch again is taken back when it is let go', async () => {
    vi.useFakeTimers()
    const world = driven()
    world.driver.start()
    world.fake.observations[0]?.end({ kind: 'unavailable' })
    await vi.advanceTimersByTimeAsync(0)
    expect(world.driver.getState().live).toBe('retrying')
    world.driver.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('tells a listener no more once it has left', async () => {
    const world = driven()
    let heard = 0
    const leave = world.driver.subscribe(() => (heard += 1))
    leave()
    world.driver.dismiss()
    expect(heard).toBe(0)
  })
})
