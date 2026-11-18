import { describe, expect, it } from 'vitest'
import { notificationProtocol } from '@omne-harness/notification-protocol'
import { OTHER, TENANT, world } from './fixtures/world.ts'

const openCodec = notificationProtocol.observations['observe-changes'].open
const INBOX = { kind: 'changed', about: 'inbox' }
const CATALOG = { kind: 'changed', about: 'catalog' }

function openValue(tenant: string) {
  const read = openCodec.read(
    {
      kind: 'object',
      entries: [{ key: 'tenant', value: { kind: 'string', value: tenant } }],
    } as never,
    {
      maxBytes: 10_000,
      maxDepth: 10,
      maxItems: 100,
      maxMembers: 10,
      maxStringLength: 1000,
      maxNumberLength: 10,
    },
  )
  if (!read.ok) throw new Error('open sample did not read')
  return read.value
}

async function observe(w: ReturnType<typeof world>, tenant = TENANT) {
  const source = w.contribution.observations['observe-changes']
  return source(w.context as never, openValue(tenant))
}

async function opened(w: ReturnType<typeof world>) {
  const answer = await observe(w)
  if (answer.outcome !== 'succeeded') throw new Error(`observation answered ${answer.outcome}`)
  return answer.frames
}

/** Settles to `waiting` when the generator has nothing to give yet. */
async function settled<T>(taking: Promise<T>) {
  const waiting = new Promise<'waiting'>(resolve => setTimeout(() => resolve('waiting'), 20))
  return Promise.race([taking, waiting])
}
const next = (frames: AsyncGenerator<unknown, unknown>) => settled(frames.next())

async function drainFirst(frames: AsyncGenerator<unknown, unknown>) {
  expect(await frames.next()).toEqual({ done: false, value: INBOX })
  expect(await frames.next()).toEqual({ done: false, value: CATALOG })
}

describe('establishing observe-changes', () => {
  it.each([
    ['denied', 'denied'],
    ['basis-unavailable', 'basis-unavailable'],
    ['throws', 'basis-unavailable'],
  ] as const)('a login answered %s does not subscribe', async (login, outcome) => {
    const w = world()
    w.state.login = login
    expect(await observe(w)).toEqual({ outcome })
    expect(w.feed.listeners.size).toBe(0)
  })

  it('without a feed, or with one that cannot be subscribed, the basis is unavailable', async () => {
    const w = world()
    w.feed.breakNext()
    expect(await observe(w)).toEqual({ outcome: 'basis-unavailable' })
    w.state.feed = undefined
    expect(await observe(w)).toEqual({ outcome: 'basis-unavailable' })
  })

  it('asks for the tenant of the opening value and subscribes before it answers', async () => {
    const w = world()
    const answer = await observe(w, OTHER)
    expect(answer.outcome).toBe('succeeded')
    expect(w.state.logins).toEqual([OTHER])
    expect(w.feed.listeners.size).toBe(1)
  })
})

describe('the frames of observe-changes', () => {
  it('says at once that the inbox and the catalogue may have changed, then waits', async () => {
    const w = world()
    const frames = await opened(w)
    await drainFirst(frames)
    expect(await next(frames)).toBe('waiting')
  })

  it('a change of the inbox of this tenant gives an inbox frame; another tenant’s gives none', async () => {
    const w = world()
    const frames = await opened(w)
    await drainFirst(frames)
    const taking = frames.next()
    w.feed.inbox(OTHER)
    expect(await settled(taking)).toBe('waiting')
    w.feed.inbox(TENANT)
    expect(await taking).toEqual({ done: false, value: INBOX })
    w.feed.catalog()
    expect(await frames.next()).toEqual({ done: false, value: CATALOG })
  })

  it('changes that arrive before the next frame is taken give one frame of each kind', async () => {
    const w = world()
    const frames = await opened(w)
    await drainFirst(frames)
    w.feed.catalog()
    for (let index = 0; index < 3; index++) w.feed.inbox(TENANT)
    expect(await frames.next()).toEqual({ done: false, value: INBOX })
    expect(await frames.next()).toEqual({ done: false, value: CATALOG })
    expect(await next(frames)).toBe('waiting')
  })

  it.each([
    ['denied', 'denied'],
    ['basis-unavailable', 'unavailable'],
    ['throws', 'unavailable'],
  ] as const)('a login answered %s before a frame ends the observation', async (login, end) => {
    const w = world()
    const frames = await opened(w)
    await drainFirst(frames)
    w.state.login = login
    w.feed.inbox(TENANT)
    expect(await frames.next()).toEqual({ done: true, value: end })
    expect(w.feed.listeners.size).toBe(0)
  })

  it('checks the login before every batch of frames, not once', async () => {
    const w = world()
    const frames = await opened(w)
    await drainFirst(frames)
    w.feed.inbox(TENANT)
    await frames.next()
    w.feed.inbox(TENANT)
    await frames.next()
    expect(w.state.logins).toHaveLength(4)
  })

  it('a feed that closed ends the observation as unavailable, also while it waits', async () => {
    const w = world()
    const frames = await opened(w)
    await drainFirst(frames)
    const waiting = frames.next()
    w.feed.close()
    expect(await waiting).toEqual({ done: true, value: 'unavailable' })
    expect(w.feed.listeners.size).toBe(0)
  })

  it('an aborted call ends the observation and lets go of the feed', async () => {
    const w = world()
    const frames = await opened(w)
    await drainFirst(frames)
    const waiting = frames.next()
    w.controller.abort()
    expect(await waiting).toEqual({ done: true, value: 'unavailable' })
    expect(w.feed.listeners.size).toBe(0)
    w.feed.inbox(TENANT)
    expect(await frames.next()).toEqual({ done: true, value: undefined })
  })

  it('a call that was aborted before it opened holds nothing', async () => {
    const w = world()
    w.controller.abort()
    const frames = await opened(w)
    expect(w.feed.listeners.size).toBe(0)
    expect(await frames.next()).toEqual({ done: true, value: 'unavailable' })
  })

  it('an observer that stops reading lets go of the feed', async () => {
    const w = world()
    const frames = await opened(w)
    await frames.next()
    await frames.return('unavailable')
    expect(w.feed.listeners.size).toBe(0)
  })

  it('two observers of two tenants each hear only their own inbox', async () => {
    const w = world()
    const mine = await opened(w)
    const theirs = (await observe(w, OTHER)) as { frames: AsyncGenerator<unknown, unknown> }
    await drainFirst(mine)
    await drainFirst(theirs.frames)
    w.feed.inbox(OTHER)
    expect(await theirs.frames.next()).toEqual({ done: false, value: INBOX })
    expect(await next(mine)).toBe('waiting')
  })
})
