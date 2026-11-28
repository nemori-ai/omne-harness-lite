import { describe, expect, it } from 'vitest'
import { createWorld, fixtureLogin, type World } from './fixtures/world.ts'

const alice = fixtureLogin('a')
const bob = fixtureLogin('b')
const ENDPOINTS = { kind: 'changed', about: 'endpoints' }
const EVENTS = { kind: 'changed', about: 'events' }

/** Settles to `waiting` when the generator has nothing to give yet. */
async function settled<T>(taking: Promise<T>) {
  const waiting = new Promise<'waiting'>(resolve => setTimeout(() => resolve('waiting'), 20))
  return Promise.race([taking, waiting])
}

async function opened(world: World, controller = new AbortController()) {
  const answer = await world.observe(alice, alice, controller)
  if (answer.outcome !== 'succeeded') throw new Error(`observation answered ${answer.outcome}`)
  expect(await answer.frames.next()).toEqual({ done: false, value: ENDPOINTS })
  return answer.frames
}

describe('opening observe-endpoints (C107)', () => {
  it.each([
    ['denied', 'denied'],
    ['basis-unavailable', 'basis-unavailable'],
    ['throw', 'basis-unavailable'],
  ] as const)('a login the identity answers %s does not subscribe', async (refusal, outcome) => {
    const world = createWorld()
    world.refuseAsk(0, refusal)
    expect(await world.observe(alice)).toEqual({ outcome })
    expect(world.feed.listeners.size).toBe(0)
  })

  it("another account's tenant is denied", async () => {
    const world = createWorld()
    expect(await world.observe(bob, alice)).toEqual({ outcome: 'denied' })
    expect(world.feed.listeners.size).toBe(0)
  })

  it('without the faces of MCP, or with a feed that cannot be subscribed, the basis is unavailable', async () => {
    const world = createWorld()
    world.feed.breakSubscribe()
    expect(await world.observe(alice)).toEqual({ outcome: 'basis-unavailable' })
    world.removeFaces()
    expect(await world.observe(alice)).toEqual({ outcome: 'basis-unavailable' })
  })
})

describe('the frames of observe-endpoints (C107)', () => {
  it('says at once that the endpoints may have changed, then waits', async () => {
    const frames = await opened(createWorld())
    expect(await settled(frames.next())).toBe('waiting')
  })

  it("a change of this tenant's endpoints gives a frame; another tenant's gives none", async () => {
    const world = createWorld()
    const frames = await opened(world)
    const taking = frames.next()
    world.feed.changed(bob)
    expect(await settled(taking)).toBe('waiting')
    world.feed.changed(alice)
    expect(await taking).toEqual({ done: false, value: ENDPOINTS })
  })

  it('events that may have changed give a frame of their own, after one for the endpoints (C307)', async () => {
    const world = createWorld()
    const frames = await opened(world)
    world.feed.changed(alice, 'events')
    expect(await frames.next()).toEqual({ done: false, value: EVENTS })
    world.feed.changed(alice, 'events')
    world.feed.changed(alice)
    world.feed.changed(alice, 'events')
    expect(await frames.next()).toEqual({ done: false, value: ENDPOINTS })
    expect(await frames.next()).toEqual({ done: false, value: EVENTS })
    expect(await settled(frames.next())).toBe('waiting')
  })

  it('changes that arrive before the next frame is taken give one frame', async () => {
    const world = createWorld()
    const frames = await opened(world)
    for (let index = 0; index < 3; index++) world.feed.changed(alice)
    expect(await frames.next()).toEqual({ done: false, value: ENDPOINTS })
    expect(await settled(frames.next())).toBe('waiting')
  })

  it.each([
    ['denied', 'denied'],
    ['basis-unavailable', 'unavailable'],
    ['throw', 'unavailable'],
  ] as const)(
    'the login is asked again before each frame; answered %s, it ends the observation',
    async (refusal, end) => {
      const world = createWorld()
      const frames = await opened(world)
      world.refuseAsk(world.principalAsks.length, refusal)
      world.feed.changed(alice)
      expect(await frames.next()).toEqual({ done: true, value: end })
      expect(world.feed.listeners.size).toBe(0)
    },
  )

  it('an observer already gone when it opens hears nothing and holds no subscription', async () => {
    const world = createWorld()
    const controller = new AbortController()
    controller.abort()
    const answer = await world.observe(alice, alice, controller)
    if (answer.outcome !== 'succeeded') throw new Error(`observation answered ${answer.outcome}`)
    expect(world.feed.listeners.size).toBe(0)
    expect(await answer.frames.next()).toEqual({ done: true, value: 'unavailable' })
  })

  it('the feed going away ends it as unavailable, and so does the observer leaving', async () => {
    const world = createWorld()
    const frames = await opened(world)
    const waiting = frames.next()
    world.feed.close()
    expect(await settled(waiting)).toEqual({ done: true, value: 'unavailable' })
    expect(world.feed.listeners.size).toBe(0)
    const controller = new AbortController()
    const again = await opened(world, controller)
    const taking = again.next()
    controller.abort()
    expect(await taking).toEqual({ done: true, value: 'unavailable' })
    expect(world.feed.listeners.size).toBe(0)
  })
})
