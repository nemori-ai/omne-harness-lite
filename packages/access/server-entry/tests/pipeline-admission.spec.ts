// Steps 1 to 6 of the new address (RFC-0015 §5 判断次序; #1233 spec C3): each step answers with a
// status code and an empty body, closes the connection, and reads no body. Two steps broken at once
// answer by the earlier one.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HttpReply } from './support/harness.ts'
import {
  call,
  held,
  rawCall,
  rawHeaders,
  startAccessFixture,
  type AccessFixture,
} from './support/pipeline-kit.ts'
import { send } from './support/harness.ts'

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
}

describe('one answer per step', () => {
  beforeEach(async () => {
    fixture = await startAccessFixture()
  })

  it('step 1: a path off the grammar is 404', async () => {
    expectBare(await send(fixture.port, '/api/notes/v1/read-note/', { body: '{}' }), 404)
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

  it('step 5: a protocol not mounted, or a name not in it, is 404', async () => {
    expectBare(await send(fixture.port, '/api/other/v1/read-note', { body: '{}' }), 404)
    expectBare(await send(fixture.port, '/api/notes/v2/read-note', { body: '{}' }), 404)
    expectBare(await call(fixture.port, 'no-such-note'), 404)
    expectBare(await call(fixture.port, 'constructor'), 404)
    expect(fixture.log.entries).toEqual([])
  })

  it('step 5: an observation is 404 for now, and the call has left', async () => {
    expectBare(await call(fixture.port, 'watch-note'), 404)
    expect(fixture.log.entries).toEqual([{ name: 'watch-note', left: true }])
  })

  it('step 5: a protocol taken down answers 404 at the same address', async () => {
    await fixture.takeDown()
    expectBare(await call(fixture.port, 'read-note', { body: '{"noteId":"n-1"}' }), 404)
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

    expectBare(await send(fixture.port, '/api/other/v1/read-note', { body: '{}' }), 404)
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
