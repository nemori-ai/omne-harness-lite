import { describe, expect, it } from 'vitest'
import { createWorld, fixtureLogin, loginIdentity, offered, type World } from './fixtures/world.ts'

const ALICE = fixtureLogin('a')
const signal = new AbortController().signal
const NOTES = offered('notes', 'v-notes', { client: true }, { 'main.js': 12, 'style.css': 3 })
const SYNC = offered('sync', 'v-sync', { server: true })
const BOTH = offered('board', 'v-board', { client: true, server: true })

const BODIES = {
  'list-wanted': { tenant: ALICE.tenant, side: 'client' },
  'read-file': {
    tenant: ALICE.tenant,
    name: 'notes',
    version: 'v-notes',
    path: 'main.js',
    offset: 4,
    limit: 8,
  },
  'report-loaded': {
    tenant: ALICE.tenant,
    client: 'desktop-1',
    plugins: [{ name: 'notes', version: 'v-notes', state: 'loaded', reason: null }],
  },
} as const
type Name = keyof typeof BODIES
const NAMES = Object.keys(BODIES) as Name[]

function call(world: World, name: Name, body: unknown = BODIES[name]) {
  const handler = world.contribution.operations[name] as (
    call: unknown,
    body: unknown,
  ) => Promise<unknown>
  return handler({ principal: loginIdentity(ALICE), messageId: 'm-1', signal }, body)
}
const principal = { account: ALICE.account, tenant: ALICE.tenantText }

function serving() {
  const world = createWorld()
  world.offer({ kind: 'read', offered: [NOTES, SYNC, BOTH] })
  return world
}

describe('every operation of plugin/v1', () => {
  it.each(NAMES)('%s asks whether this login may act for the tenant, as text', async name => {
    const world = serving()
    await call(world, name)
    expect(world.asked).toEqual([principal])
  })

  it.each(NAMES)('%s is denied before the source is asked', async name => {
    const world = serving()
    world.refuseTargets('denied')
    expect(await call(world, name)).toEqual({ outcome: 'denied' })
    expect([world.lists, world.reads, world.reports.reportsOf(ALICE.tenantText)]).toEqual([
      [],
      [],
      [],
    ])
  })

  it.each(NAMES)(
    '%s answers basis-unavailable when the acting cannot be judged or judging it breaks',
    async name => {
      for (const refusal of ['basis-unavailable', 'throw'] as const) {
        const world = serving()
        world.refuseTargets(refusal)
        expect(await call(world, name)).toEqual({ outcome: 'basis-unavailable' })
        expect([world.lists, world.reads]).toEqual([[], []])
      }
    },
  )

  it('a tenant that is no minted tenant identity is a fault of the caller', async () => {
    const world = serving()
    await expect(call(world, 'list-wanted', { tenant: {}, side: 'client' })).rejects.toThrow(
      'tenant is not a minted TenantId',
    )
    expect(world.lists).toEqual([])
  })
})

describe('list-wanted', () => {
  it('gives what this side is to load, by name, with the manifest as the source holds it', async () => {
    const world = serving()
    expect(await call(world, 'list-wanted')).toEqual({
      outcome: 'succeeded',
      body: {
        plugins: [
          {
            name: 'board',
            version: 'v-board',
            manifest: BOTH.manifestText,
            files: [{ path: 'main.js', digest: 'd-main.js', bytes: 10 }],
          },
          {
            name: 'notes',
            version: 'v-notes',
            manifest: NOTES.manifestText,
            files: [
              { path: 'main.js', digest: 'd-main.js', bytes: 12 },
              { path: 'style.css', digest: 'd-style.css', bytes: 3 },
            ],
          },
        ],
      },
    })
    expect(world.lists).toEqual([principal])
    const server = await call(world, 'list-wanted', { tenant: ALICE.tenant, side: 'server' })
    expect(
      (server as { body: { plugins: { name: string }[] } }).body.plugins.map(each => each.name),
    ).toEqual(['board', 'sync'])
  })

  it('a name offered twice is not given', async () => {
    const world = createWorld()
    world.offer({ kind: 'read', offered: [NOTES, { ...NOTES, version: 'v-other' }] })
    expect(await call(world, 'list-wanted')).toEqual({
      outcome: 'succeeded',
      body: { plugins: [] },
    })
  })

  it('a source that is unavailable or throws is basis-unavailable', async () => {
    const world = createWorld()
    world.offer({ kind: 'unavailable' })
    expect(await call(world, 'list-wanted')).toEqual({ outcome: 'basis-unavailable' })
    world.offer(() => {
      throw new Error('the source broke')
    })
    expect(await call(world, 'list-wanted')).toEqual({ outcome: 'basis-unavailable' })
  })
})

describe('read-file', () => {
  const read = (world: World, change: object = {}) =>
    call(world, 'read-file', { ...BODIES['read-file'], ...change })
  const bytes = new Uint8Array([5, 6, 7])

  it('reads a file of a plugin this tenant is to load, from the source', async () => {
    const world = serving()
    world.answerRead({ kind: 'read', part: bytes, next: 7, bytes: 12 })
    expect(await read(world)).toEqual({
      outcome: 'succeeded',
      body: { part: bytes, next: 7, bytes: 12 },
    })
    expect(world.reads).toEqual([
      {
        principal,
        at: { name: 'notes', version: 'v-notes', path: 'main.js', offset: 4, limit: 8 },
      },
    ])
  })

  it.each([
    [{ name: 'other' }, 'plugin'],
    [{ version: 'v-old' }, 'plugin'],
    [{ path: 'missing.js' }, 'file'],
    [{ path: '../sync/main.js' }, 'file'],
    [{ path: '/main.js' }, 'file'],
  ] as const)('%j is not-found %s, and the source is not read', async (change, reason) => {
    const world = serving()
    expect(await read(world, change)).toEqual({ outcome: 'not-found', body: { reason } })
    expect(world.reads).toEqual([])
  })

  it('a name offered twice is no plugin to read', async () => {
    const world = createWorld()
    world.offer({ kind: 'read', offered: [NOTES, { ...NOTES, version: 'v-other' }] })
    expect(await read(world)).toEqual({ outcome: 'not-found', body: { reason: 'plugin' } })
  })

  it('what the source finds absent at reading is not-found, of what it says', async () => {
    for (const what of ['plugin', 'file'] as const) {
      const world = serving()
      world.answerRead({ kind: 'absent', what })
      expect(await read(world)).toEqual({ outcome: 'not-found', body: { reason: what } })
    }
  })

  it('a limit of nothing is limited; a limit above a part is read as one part', async () => {
    const world = serving()
    expect(await read(world, { limit: 0 })).toEqual({ outcome: 'limited', body: {} })
    world.answerRead({ kind: 'read', part: bytes, next: null, bytes: 12 })
    await read(world, { limit: 10_000_000 })
    expect(world.reads[0]?.at.limit).toBe(262_144)
  })

  it('a source that is unavailable or throws, in listing or in reading, is basis-unavailable', async () => {
    const unlisted = createWorld()
    unlisted.offer({ kind: 'unavailable' })
    expect(await read(unlisted)).toEqual({ outcome: 'basis-unavailable' })
    const unread = serving()
    expect(await read(unread)).toEqual({ outcome: 'basis-unavailable' })
    unread.answerRead(() => {
      throw new Error('the disk broke')
    })
    expect(await read(unread)).toEqual({ outcome: 'basis-unavailable' })
  })
})

describe('report-loaded', () => {
  it('records what a client loaded; the same client reporting again replaces it', async () => {
    const world = serving()
    expect(await call(world, 'report-loaded')).toEqual({ outcome: 'succeeded', body: {} })
    const failed = { name: 'notes', version: 'v-notes', state: 'failed', reason: 'it threw' }
    await call(world, 'report-loaded', {
      tenant: ALICE.tenant,
      client: 'web-2',
      plugins: [failed],
    })
    await call(world, 'report-loaded', { ...BODIES['report-loaded'], plugins: [] })
    expect(world.reports.reportsOf(ALICE.tenantText)).toEqual([
      { client: 'desktop-1', plugins: [] },
      { client: 'web-2', plugins: [failed] },
    ])
    expect(world.reports.reportsOf(fixtureLogin('b').tenantText)).toEqual([])
  })

  it('a record that breaks is unknown', async () => {
    const world = serving()
    world.reports.record = () => {
      throw new Error('the record broke')
    }
    expect(await call(world, 'report-loaded')).toEqual({ outcome: 'unknown' })
  })
})

describe('observe-wanted', () => {
  const open = { tenant: ALICE.tenant, side: 'client' }
  const observe = (world: World, stop = new AbortController()) =>
    world.contribution.observations['observe-wanted']!(
      { principal: loginIdentity(ALICE), messageId: 'm-2', signal: stop.signal } as never,
      open as never,
    )

  it('is denied, or unavailable, before it subscribes', async () => {
    for (const refusal of ['denied', 'basis-unavailable', 'throw'] as const) {
      const world = serving()
      world.refuseTargets(refusal)
      expect(await observe(world)).toEqual({
        outcome: refusal === 'denied' ? 'denied' : 'basis-unavailable',
      })
      expect(world.listeners.size).toBe(0)
    }
  })

  it('says changed when the source says so, and stops listening when the connection ends', async () => {
    const world = serving()
    const stop = new AbortController()
    const opened = await observe(world, stop)
    if (opened.outcome !== 'succeeded') throw new Error(opened.outcome)
    expect(await opened.frames.next()).toEqual({ done: false, value: { kind: 'changed' } })
    const next = opened.frames.next()
    world.change()
    expect(await next).toEqual({ done: false, value: { kind: 'changed' } })
    expect(world.listeners.size).toBe(1)
    stop.abort()
    expect(world.listeners.size).toBe(0)
    expect(await opened.frames.next()).toEqual({ done: true, value: 'unavailable' })
  })
})
