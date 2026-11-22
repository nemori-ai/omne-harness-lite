import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import { defineProtocol, revisionOf, ruleCodec } from '@omne-harness/public-contract'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  MESSAGE_ID,
  rawCall,
  rawHeaders,
  startAccessFixture,
  type AccessFixture,
} from './support/access-kit.ts'
import { openStream, send } from './support/entry.ts'

const REJECTED = '{"outcome":"protocol-rejected","body":{}}'

const ref = ruleCodec({
  kind: 'object',
  fields: {
    id: { rule: { kind: 'text' } },
    lang: { rule: { kind: 'text' }, optional: true, since: 2 },
  },
})
const draft = ruleCodec({
  kind: 'object',
  fields: {
    id: { rule: { kind: 'text' } },
    title: { rule: { kind: 'text' } },
    colour: { rule: { kind: 'text' }, optional: true, since: 2 },
    pinned: { rule: { kind: 'boolean' }, optional: true, since: 3 },
  },
})
const empty = ruleCodec({ kind: 'object', fields: {} })

/** A protocol at revision 3: two fields came at 2, one field and one operation came at 3. */
const drafts = defineProtocol({
  name: 'drafts',
  major: 1,
  operations: {
    read: {
      identity: 'none',
      effect: 'read',
      limit: 'small',
      body: ref,
      outcomes: { succeeded: draft },
    },
    pin: {
      identity: 'none',
      effect: 'commit',
      limit: 'small',
      body: ref,
      outcomes: { succeeded: empty },
      since: 3,
    },
  },
  observations: {
    watch: { identity: 'none', open: ref, frame: draft, ends: ['gone'] },
  },
})

let fixture: AccessFixture
let received: unknown[]

beforeEach(async () => {
  fixture = await startAccessFixture()
  received = []
  const contribution: AccessContribution<typeof drafts> = {
    protocol: drafts,
    operations: {
      read: async (_call, body) => {
        received.push(body)
        return {
          outcome: 'succeeded',
          body: { id: body.id, title: 'T', colour: 'red', pinned: true },
        }
      },
      pin: async (_call, body) => {
        received.push(body)
        return { outcome: 'succeeded', body: {} }
      },
    },
    observations: {
      watch: async (_context, open) => ({
        outcome: 'succeeded',
        frames: (async function* () {
          yield { id: open.id, title: 'T', colour: 'red', pinned: true }
          return 'gone' as const
        })(),
      }),
    },
  }
  fixture.log.registry.mount(contribution)
})

afterEach(async () => {
  await fixture.stop()
})

const headers = (revision?: string): Record<string, string> => ({
  'omne-message-id': MESSAGE_ID,
  ...(revision === undefined ? {} : { 'omne-contract-revision': revision }),
})

const call = (name: string, body: string, revision?: string) =>
  send(fixture.port, `/api/drafts/v1/${name}`, { headers: headers(revision), body })

it('the test protocol is at revision 3', () => {
  expect(revisionOf(drafts)).toBe(3)
})

describe('the answer is written at the lesser of the two revisions (V2)', () => {
  it('a caller that names no revision is at 1: it gets none of the later fields', async () => {
    const reply = await call('read', '{"id":"d-1"}')
    expect(reply.status).toBe(200)
    expect(reply.text).toBe('{"outcome":"succeeded","body":{"id":"d-1","title":"T"}}')
  })

  it.each([
    ['1', '{"id":"d-1","title":"T"}'],
    ['2', '{"id":"d-1","title":"T","colour":"red"}'],
    ['3', '{"id":"d-1","title":"T","colour":"red","pinned":true}'],
    ['9', '{"id":"d-1","title":"T","colour":"red","pinned":true}'],
  ])('a caller at revision %s gets %s', async (revision, body) => {
    const reply = await call('read', '{"id":"d-1"}', revision)
    expect(reply.text).toBe(`{"outcome":"succeeded","body":${body}}`)
  })

  it('writes every frame of an observation at that revision too', async () => {
    const stream = openStream(fixture.port, '{"id":"d-1"}', {
      path: '/api/drafts/v1/watch',
      headers: headers('2'),
    })
    await stream.ended
    expect(stream.chunks.join('')).toContain(
      '{"kind":"frame","frame":{"id":"d-1","title":"T","colour":"red"}}',
    )
    expect(stream.chunks.join('')).not.toContain('pinned')
  })
})

describe('the request is read at the lesser of the two revisions (V1)', () => {
  it('takes a later field from a caller that says it is that late', async () => {
    const reply = await call('read', '{"id":"d-1","lang":"zh"}', '2')
    expect(reply.status).toBe(200)
    expect(received).toEqual([{ id: 'd-1', lang: 'zh' }])
  })

  it('refuses a later field from a caller that says it is earlier, and runs nothing', async () => {
    const reply = await call('read', '{"id":"d-1","lang":"zh"}', '1')
    expect(reply.status).toBe(400)
    expect(reply.text).toBe(REJECTED)
    expect(received).toEqual([])
    expect(fixture.diagnostics.map(event => event.code)).toContain('access.body-rejected')
  })

  it('refuses an operation that came later than the caller says it is, and runs nothing', async () => {
    const early = await call('pin', '{"id":"d-1"}', '2')
    expect(early.status).toBe(400)
    expect(early.text).toBe(REJECTED)
    expect(early.headers['omne-message-id']).toBe(MESSAGE_ID)
    expect(received).toEqual([])
    expect(fixture.diagnostics.map(event => event.code)).toContain('access.revision-rejected')
    const late = await call('pin', '{"id":"d-1"}', '3')
    expect(late.status).toBe(200)
    expect(received).toEqual([{ id: 'd-1' }])
  })
})

describe('a revision header that cannot be read', () => {
  it.each(['0', '-1', '1.5', 'two', '', '01', '1e3', '2 3', '99999999999'])(
    'refuses %j as a protocol rejection that carries the message id, and runs nothing',
    async revision => {
      const reply = await call('read', '{"id":"d-1"}', revision)
      expect(reply.status).toBe(400)
      expect(reply.text).toBe(REJECTED)
      expect(reply.headers['omne-message-id']).toBe(MESSAGE_ID)
      expect(received).toEqual([])
      expect(fixture.diagnostics.map(event => event.code)).toContain('access.revision-rejected')
    },
  )

  it('refuses two revision headers, though each alone could be read', async () => {
    const body = '{"id":"d-1"}'
    const twice = ['omne-contract-revision: 2', 'omne-contract-revision: 2']
    const reply = await rawCall(
      fixture.port,
      '/api/drafts/v1/read',
      rawHeaders(body.length, twice),
      body,
    )
    expect(reply).toContain('HTTP/1.1 400')
    expect(reply).toContain(REJECTED)
    expect(received).toEqual([])
  })

  it('is judged after the message id: without one the rejection carries none', async () => {
    const reply = await send(fixture.port, '/api/drafts/v1/read', {
      headers: { 'omne-contract-revision': 'two' },
      body: '{"id":"d-1"}',
    })
    expect(reply.status).toBe(400)
    expect(reply.headers['omne-message-id']).toBeUndefined()
    expect(fixture.diagnostics.map(event => event.code)).toEqual(['access.message-id-rejected'])
  })
})
