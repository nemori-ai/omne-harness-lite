import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HttpReply } from './support/entry.ts'
import {
  call,
  held,
  rawCall,
  rawHeaders,
  startAccessFixture,
  type AccessFixture,
} from './support/access-kit.ts'
import { send } from './support/entry.ts'

let fixture: AccessFixture

afterEach(async () => {
  await fixture.stop()
})

function expectBare(reply: HttpReply, status: number): void {
  expect(reply.status).toBe(status)
  expect(reply.text).toBe('')
  expect(reply.headers.connection).toBe('close')
  expect(reply.headers['cache-control']).toBe('no-store')
  expect(reply.headers['omne-message-id']).toBeUndefined()
  if (status !== 405) expect(reply.headers.allow).toBeUndefined()
}

/** What is not provided answers 404 with a body that says nothing ran, and why. */
function expectNotMounted(reply: HttpReply): void {
  expect(reply.status).toBe(404)
  expect(reply.text).toBe('{"kind":"not-executed","reason":"not-mounted"}')
  expect(reply.headers['content-type']).toBe('application/json; charset=utf-8')
}

describe('one answer per step', () => {
  beforeEach(async () => {
    fixture = await startAccessFixture()
  })

  it('step 1: a path off the grammar is 404, and the diagnostic names the path', async () => {
    expectBare(await send(fixture.port, '/api/notes/v1/read-note/', { body: '{}' }), 404)
    expect(fixture.diagnostics).toEqual([
      { code: 'access.path-rejected', path: '/api/notes/v1/read-note/' },
    ])
  })

  it('a major version of several digits is on the grammar: not mounted, not off the grammar', async () => {
    expectNotMounted(await send(fixture.port, '/api/notes/v12/read-note', { body: '{}' }))
    expect(fixture.diagnostics.map(event => event.code)).toEqual(['access.not-mounted'])
  })

  it('step 2: a method other than POST is 405 with Allow: POST', async () => {
    const reply = await call(fixture.port, 'read-note', { method: 'PUT' })
    expectBare(reply, 405)
    expect(reply.headers.allow).toBe('POST')
  })

  it('step 3: a foreign Host is 421', async () => {
    expectBare(await call(fixture.port, 'read-note', { headers: { host: 'evil.example' } }), 421)
  })

  it('step 4: a Content-Type other than JSON is 415 with no body', async () => {
    const reply = await call(fixture.port, 'read-note', {
      headers: { 'content-type': 'text/plain' },
    })
    expectBare(reply, 415)
  })

  it('step 5: a protocol not mounted and a name the mounted protocol does not have each answer a 404 that says nothing ran, and why', async () => {
    expectNotMounted(await send(fixture.port, '/api/other/v1/read-note', { body: '{}' }))
    expectNotMounted(await send(fixture.port, '/api/notes/v2/read-note', { body: '{}' }))
    for (const name of ['no-such-note', 'constructor']) {
      const reply = await call(fixture.port, name)
      expect(reply.status).toBe(404)
      expect(reply.text).toBe('{"kind":"not-executed","reason":"not-offered"}')
    }
    expect(fixture.log.entries).toEqual([])
  })

  it('step 5: an observation enters like an operation and goes on to step 7 (#1249)', async () => {
    const reply = await call(fixture.port, 'watch-note', {
      headers: { 'omne-message-id': undefined },
      body: '{"noteId":"n-1"}',
    })
    expect(reply.status).toBe(400)
    expect(reply.json).toEqual({ outcome: 'protocol-rejected', body: {} })
    expect(fixture.log.entries).toEqual([{ name: 'watch-note', left: true }])
  })

  it('step 5: a protocol taken down answers 404 at the same address', async () => {
    await fixture.takeDown()
    expectNotMounted(await call(fixture.port, 'read-note', { body: '{"noteId":"n-1"}' }))
  })

  it('answers a protocol not mounted without reading the declared body', async () => {
    const reply = await rawCall(fixture.port, '/api/other/v1/read-note', rawHeaders(100))
    expect(reply).toMatch(/^HTTP\/1\.1 404 /)
    expect(reply).toMatch(/\r\nconnection: close\r\n/i)
  })
})

describe('the path grammar', () => {
  beforeEach(async () => {
    fixture = await startAccessFixture()
  })

  it.each([
    ['not under /api', '/apx/notes/v1/read-note'],
    ['/api not at the start', '/x/api/notes/v1/read-note'],
    ['a missing segment', '/api/notes/v1'],
    ['an extra segment', '/api/notes/v1/read-note/more'],
    ['a trailing slash', '/api/notes/v1/read-note/'],
    ['an empty segment', '/api//v1/read-note'],
    ['an upper-case protocol name', '/api/Notes/v1/read-note'],
    ['an underscore in the name', '/api/notes/v1/read_note'],
    ['a version without v', '/api/notes/1/read-note'],
    ['a leading zero in the version', '/api/notes/v01/read-note'],
    ['version zero', '/api/notes/v0/read-note'],
    ['a percent-encoded name', '/api/notes/v1/read%2Dnote'],
    ['a query string', '/api/notes/v1/read-note?x=1'],
    ['an empty query string', '/api/notes/v1/read-note?'],
  ])('%s is 404 before anything else', async (_case, path) => {
    expectBare(await send(fixture.port, path, { body: '{}' }), 404)
    expect(fixture.log.entries).toEqual([])
  })
})

describe('two steps broken at once answer by the earlier one', () => {
  beforeEach(async () => {
    fixture = await startAccessFixture()
  })

  it('1 before 2', async () => {
    expectBare(await send(fixture.port, '/api/notes/v1/', { method: 'GET' }), 404)
  })

  it('2 before 3', async () => {
    const reply = await call(fixture.port, 'read-note', {
      method: 'PUT',
      headers: { host: 'evil.example' },
    })
    expectBare(reply, 405)
  })

  it('3 before 4', async () => {
    const reply = await call(fixture.port, 'read-note', {
      headers: { host: 'evil.example', 'content-type': 'text/plain' },
    })
    expectBare(reply, 421)
  })

  it('4 before 5', async () => {
    const reply = await send(fixture.port, '/api/other/v1/read-note', {
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    })
    expectBare(reply, 415)
  })
})

describe('step 6: the in-flight budget', () => {
  beforeEach(async () => {
    fixture = await startAccessFixture({ config: { maxInFlightRequests: 1 } })
  })

  it('a full budget answers 404 for a protocol not mounted, 429 for one mounted, and leaves', async () => {
    const hold = held<{ outcome: 'succeeded'; body: { noteId: string; title: string } }>()
    fixture.notes.scripts['read-note'] = () => hold.promise
    const first = call(fixture.port, 'read-note', { body: '{"noteId":"n-1"}' })
    await fixture.notes.called()

    expectNotMounted(await send(fixture.port, '/api/other/v1/read-note', { body: '{}' }))
    const busy = await call(fixture.port, 'read-note', { body: '{"noteId":"n-2"}' })
    expectBare(busy, 429)
    expect(busy.headers['x-omne-limit']).toBe('in-flight-requests')
    expect(fixture.log.entries).toEqual([
      { name: 'read-note', left: false },
      { name: 'read-note', left: true },
    ])

    hold.resolve({ outcome: 'succeeded', body: { noteId: 'n-1', title: 't' } })
    expect((await first).status).toBe(200)
  })
})
