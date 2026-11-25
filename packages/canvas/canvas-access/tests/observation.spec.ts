import { tenantIdSchema, type KindName } from '@omne-harness/canvas-contract'
import { describe, expect, it } from 'vitest'
import { OTHER, SAMPLES, TENANT, media, world } from './fixtures/world.ts'

const CHANGED = { done: false, value: { kind: 'changed' } }
type World = ReturnType<typeof world>
type Frames = AsyncGenerator<unknown, unknown>

/** A world whose canvas declares media.object, so that a place through the protocol changes it. */
function declaring() {
  const w = world()
  w.kinds.declare({ name: 'media.object' as KindName, label: '媒体', summary: 's', reference: 'r' })
  return w
}

async function opened(w: World, tenant = TENANT): Promise<Frames> {
  const answer = await w.observe(tenant)
  if (answer.outcome !== 'succeeded') throw new Error(`observation answered ${answer.outcome}`)
  return answer.frames as Frames
}

/** Settles to `waiting` when the generator has nothing to give yet. */
async function settled<T>(taking: Promise<T>) {
  const waiting = new Promise<'waiting'>(resolve => setTimeout(() => resolve('waiting'), 20))
  return Promise.race([taking, waiting])
}
const next = (frames: Frames) => settled(frames.next())

const place = (w: World, ref: string, tenant = TENANT) =>
  w.call('place', { ...SAMPLES.place, reference: media(ref), tenant })

describe('establishing observe-changes', () => {
  it.each([
    ['denied', 'denied'],
    ['basis-unavailable', 'basis-unavailable'],
    ['throws', 'basis-unavailable'],
  ] as const)('a login answered %s does not subscribe', async (login, outcome) => {
    const w = world()
    w.state.login = login
    expect(await w.observe()).toEqual({ outcome })
    expect(w.feed.listening.size).toBe(0)
  })

  it('without a feed, or with one that cannot be subscribed, the basis is unavailable', async () => {
    const w = world()
    w.feed.breakNext()
    expect(await w.observe()).toEqual({ outcome: 'basis-unavailable' })
    w.state.feed = undefined
    expect(await w.observe()).toEqual({ outcome: 'basis-unavailable' })
  })

  it('asks for the tenant of the opening value and subscribes to that tenant before it answers', async () => {
    const w = world()
    expect((await w.observe(OTHER)).outcome).toBe('succeeded')
    expect(w.state.logins).toEqual([OTHER])
    expect(w.feed.subscribed).toEqual([tenantIdSchema.parse(OTHER)])
    expect(w.feed.listening.size).toBe(1)
  })
})

describe('the frames of observe-changes', () => {
  it('says at once that the canvas may have changed, then waits', async () => {
    const frames = await opened(world())
    expect(await frames.next()).toEqual(CHANGED)
    expect(await next(frames)).toBe('waiting')
  })

  it('a write of this tenant that changed the canvas gives a frame; one of another tenant gives none', async () => {
    const w = declaring()
    const frames = await opened(w)
    await frames.next()
    const taking = frames.next()
    expect(await place(w, 'a', OTHER)).toMatchObject({ outcome: 'succeeded' })
    expect(await settled(taking)).toBe('waiting')
    expect(await place(w, 'a')).toMatchObject({ outcome: 'succeeded' })
    expect(await taking).toEqual(CHANGED)
  })

  it('a write that changed nothing, or was not done, gives no frame', async () => {
    const w = declaring()
    await place(w, 'a')
    const frames = await opened(w)
    await frames.next()
    expect(await place(w, 'a')).toMatchObject({ outcome: 'no-change' })
    expect(await w.call('take', { canvas: 'main', items: ['i9'] })).toMatchObject({
      outcome: 'not-found',
    })
    expect(await next(frames)).toBe('waiting')
  })

  it('changes that arrive before the next frame is taken give one frame', async () => {
    const w = declaring()
    const frames = await opened(w)
    await frames.next()
    for (const ref of ['a', 'b', 'c']) await place(w, ref)
    expect(await frames.next()).toEqual(CHANGED)
    expect(await next(frames)).toBe('waiting')
  })

  it.each([
    ['denied', 'denied'],
    ['basis-unavailable', 'unavailable'],
    ['throws', 'unavailable'],
  ] as const)('a login answered %s before a frame ends the observation', async (login, end) => {
    const w = declaring()
    const frames = await opened(w)
    await frames.next()
    await place(w, 'a')
    w.state.login = login
    expect(await frames.next()).toEqual({ done: true, value: end })
    expect(w.feed.listening.size).toBe(0)
  })

  it('checks the login before every frame, not once', async () => {
    const w = declaring()
    const frames = await opened(w)
    await frames.next()
    await place(w, 'a')
    await frames.next()
    await place(w, 'b')
    await frames.next()
    expect(w.state.logins.filter(tenant => tenant === TENANT).length).toBe(6)
  })

  it('a feed that closed ends the observation as unavailable, also while it waits', async () => {
    const w = world()
    const frames = await opened(w)
    await frames.next()
    const waiting = frames.next()
    w.changes.close()
    expect(await waiting).toEqual({ done: true, value: 'unavailable' })
    expect(w.feed.listening.size).toBe(0)
  })

  it('an aborted call ends the observation and lets go of the feed', async () => {
    const w = declaring()
    const frames = await opened(w)
    await frames.next()
    const waiting = frames.next()
    w.controller.abort()
    expect(await waiting).toEqual({ done: true, value: 'unavailable' })
    expect(w.feed.listening.size).toBe(0)
    await place(w, 'a')
    expect(await frames.next()).toEqual({ done: true, value: undefined })
  })

  it('a call that was aborted before it opened holds nothing', async () => {
    const w = world()
    w.controller.abort()
    const frames = await opened(w)
    expect(w.feed.listening.size).toBe(0)
    expect(await frames.next()).toEqual({ done: true, value: 'unavailable' })
  })

  it('an observer that stops reading lets go of the feed once', async () => {
    const w = world()
    const frames = await opened(w)
    await frames.next()
    await frames.return('unavailable')
    expect(w.feed.listening.size).toBe(0)
    w.controller.abort()
    expect(w.feed.released).toHaveLength(1)
  })

  it('two observers of two tenants each hear only their own canvas', async () => {
    const w = declaring()
    const mine = await opened(w)
    const theirs = await opened(w, OTHER)
    await mine.next()
    await theirs.next()
    await place(w, 'a', OTHER)
    expect(await theirs.next()).toEqual(CHANGED)
    expect(await next(mine)).toBe('waiting')
  })
})
