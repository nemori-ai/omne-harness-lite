import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { defineProtocol, ruleCodec, type AvailabilityFrame } from '@omne-harness/public-contract'
import {
  connectionPlugin,
  defineProtocolClient,
  protocolServiceName,
  type Connection,
} from '@omne-harness/client-assembly/cordis'
import { applyFrame } from '@omne-harness/client-assembly'
import { fakeTransport, settle } from './support/fake-transport.ts'

const empty = ruleCodec({ kind: 'object', fields: {} })
const base = {
  identity: 'none',
  limit: 'small',
  body: empty,
  outcomes: { succeeded: empty },
} as const

/** `drafts/v1` at revision 2: `pin` came at 2. */
const drafts = defineProtocol({
  name: 'drafts',
  major: 1,
  operations: {
    read: { ...base, effect: 'read' },
    pin: { ...base, effect: 'commit', since: 2 },
  },
  observations: {},
} as const)
const DRAFTS = { name: 'drafts', major: 1 } as const
const ACCESS = { name: 'access', major: 1 } as const

const roots: Context[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await root.fiber.dispose()
})

async function tree() {
  const root = new Context()
  roots.push(root)
  const fake = fakeTransport()
  await root.plugin(
    connectionPlugin({
      transport: fake.transport,
      login: { state: () => 'signed-out', subscribe: () => () => undefined },
      sleep: () => new Promise(resolve => setImmediate(resolve)),
    }),
  )
  await root.plugin(defineProtocolClient(drafts))
  await settle()
  const connection = root.get('connection') as Connection
  const client = () =>
    root.get(protocolServiceName(DRAFTS)) as Record<string, (body: object) => Promise<unknown>>
  return { fake, connection, client }
}

const snapshot = (revision: number, ...protocols: object[]) =>
  ({ kind: 'snapshot', revision, protocols }) as AvailabilityFrame

describe('the view keeps what each served protocol is at', () => {
  it('a snapshot from a server that says it: kept; from one that does not: not known', () => {
    const told = applyFrame(undefined, snapshot(1, { ...DRAFTS, revision: 2, digest: 'sha256:x' }))
    const silent = applyFrame(undefined, snapshot(1, DRAFTS))
    if (told.kind !== 'apply' || silent.kind !== 'apply') throw new Error('not applied')
    expect(told.view.revisions.get('drafts/v1')).toBe(2)
    expect(silent.view.revisions.has('drafts/v1')).toBe(false)
  })

  it('a change that adds a protocol brings what it is at; one that removes it takes that away', () => {
    const first = applyFrame(undefined, snapshot(1, ACCESS))
    if (first.kind !== 'apply') throw new Error('not applied')
    const added = applyFrame(first.view, {
      kind: 'change',
      revision: 2,
      added: [{ ...DRAFTS, revision: 2 }],
      removed: [],
    })
    if (added.kind !== 'apply') throw new Error('not applied')
    expect(added.view.revisions.get('drafts/v1')).toBe(2)
    const gone = applyFrame(added.view, {
      kind: 'change',
      revision: 3,
      added: [],
      removed: [DRAFTS],
    })
    if (gone.kind !== 'apply') throw new Error('not applied')
    expect(gone.view.revisions.has('drafts/v1')).toBe(false)
  })
})

describe('a protocol client writes at the lesser of the two revisions (V2)', () => {
  it('before the first frame nothing is known of the server: no revision, no points, no keys', async () => {
    const { connection } = await tree()
    expect(connection.availability.peerRevision(DRAFTS)).toBeUndefined()
    expect([...connection.availability.points()]).toEqual([])
    expect(connection.availability.keys('assets.categories')).toBeUndefined()
  })

  it('the server is behind: what it does not have is unavailable here and not sent; the rest is served', async () => {
    const t = await tree()
    t.fake.push(snapshot(1, { ...ACCESS, revision: 2 }, { ...DRAFTS, revision: 1 }))
    await settle()
    expect(t.connection.availability.peerRevision(DRAFTS)).toBe(1)
    expect(await t.client()['pin']!({})).toEqual({ outcome: 'unavailable' })
    expect(t.fake.calls).toEqual([])
    expect(await t.client()['read']!({})).toEqual({ outcome: 'succeeded', body: {} })
    expect(t.fake.calls.map(call => call.operation)).toEqual(['read'])
  })

  it('the server catches up: the same client sends it from then on', async () => {
    const t = await tree()
    t.fake.push(snapshot(1, ACCESS, { ...DRAFTS, revision: 1 }))
    await settle()
    const client = t.client()
    expect(await client['pin']!({})).toEqual({ outcome: 'unavailable' })
    t.fake.push({ kind: 'change', revision: 2, added: [], removed: [DRAFTS] })
    t.fake.push({ kind: 'change', revision: 3, added: [{ ...DRAFTS, revision: 2 }], removed: [] })
    await settle()
    expect(t.connection.availability.peerRevision(DRAFTS)).toBe(2)
    expect(await t.client()['pin']!({})).toEqual({ outcome: 'succeeded', body: {} })
    expect(t.fake.calls.map(call => call.operation)).toEqual(['pin'])
  })

  it('the server does not say what it is at: everything is sent as before', async () => {
    const t = await tree()
    t.fake.push(snapshot(1, ACCESS, DRAFTS))
    await settle()
    expect(t.connection.availability.peerRevision(DRAFTS)).toBeUndefined()
    expect(await t.client()['pin']!({})).toEqual({ outcome: 'succeeded', body: {} })
    expect(t.fake.calls.map(call => call.operation)).toEqual(['pin'])
  })
})

describe('the points of the other tree, and the keys it makes public (C10)', () => {
  const protocolsPoint = { name: 'access.protocols', major: 1, revision: 1, digest: 'sha256:p' }
  const categories = (...keys: string[]) => ({
    name: 'assets.categories',
    major: 1,
    revision: 1,
    digest: 'sha256:c',
    keys,
  })
  const told = (revision: number, ...points: object[]) =>
    ({ kind: 'snapshot', revision, protocols: [ACCESS], points }) as AvailabilityFrame

  it('a server that tells them: the points are read by name, the keys only where they are public', async () => {
    const t = await tree()
    t.fake.push(told(1, protocolsPoint, categories('mcp', 'skills')))
    await settle()
    const { availability } = t.connection
    expect([...availability.points().keys()]).toEqual(['access.protocols', 'assets.categories'])
    expect(availability.points().get('assets.categories')).toMatchObject({ major: 1, revision: 1 })
    expect(availability.keys('assets.categories')).toEqual(['mcp', 'skills'])
    expect(availability.keys('access.protocols')).toBeUndefined()
    expect(availability.keys('no.such')).toBeUndefined()
  })

  it('the keys change: a subscriber is told, and reads the new ones', async () => {
    const t = await tree()
    t.fake.push(told(1, categories('mcp')))
    await settle()
    const seen: (readonly string[] | undefined)[] = []
    t.connection.availability.subscribe(() => {
      seen.push(t.connection.availability.keys('assets.categories'))
    })
    t.fake.push(told(1, categories('mcp', 'skills')))
    await settle()
    t.fake.push(told(1))
    await settle()
    expect(seen).toEqual([['mcp', 'skills'], undefined])
  })

  it('a server that does not tell them: no point is known, and a change frame leaves what is known as it is', async () => {
    const t = await tree()
    t.fake.push(snapshot(1, ACCESS))
    await settle()
    expect(t.connection.availability.points().size).toBe(0)
    t.fake.push(told(2, categories('mcp')))
    await settle()
    t.fake.push({ kind: 'change', revision: 3, added: [DRAFTS], removed: [] })
    await settle()
    expect(t.connection.availability.keys('assets.categories')).toEqual(['mcp'])
  })
})
