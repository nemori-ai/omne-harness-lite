import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { call, callHeaders, startAccessFixture, type AccessFixture } from './support/access-kit.ts'
import { send } from './support/entry.ts'

const NOT_OFFERED = '{"kind":"not-executed","reason":"not-offered"}'

let fixture: AccessFixture

beforeEach(async () => {
  fixture = await startAccessFixture()
})

afterEach(async () => {
  await fixture.stop()
})

describe('a name the mounted protocol does not have (V3)', () => {
  it('answers that nothing ran, with a body that says why', async () => {
    const reply = await call(fixture.port, 'no-such-operation')
    expect(reply.status).toBe(404)
    expect(reply.headers['content-type']).toBe('application/json; charset=utf-8')
    expect(reply.headers['cache-control']).toBe('no-store')
    expect(reply.headers.connection).toBe('close')
    expect(reply.headers['omne-message-id']).toBeUndefined()
    expect(reply.text).toBe(NOT_OFFERED)
    expect(fixture.notes.calls).toEqual([])
    expect(fixture.diagnostics).toEqual([
      {
        code: 'access.not-offered',
        path: '/api/notes/v1/no-such-operation',
        protocol: 'notes',
        major: 1,
        operation: 'no-such-operation',
      },
    ])
  })

  it('says the same to a caller without a login: which protocols are mounted is public', async () => {
    const reply = await send(fixture.port, '/api/notes/v1/no-such-operation', { body: '{}' })
    expect(reply.status).toBe(404)
    expect(reply.text).toBe(NOT_OFFERED)
  })
})

describe('two instances hold the protocol at once', () => {
  it('answers 404 that says nothing ran because of the conflict, names both in the diagnostic, and calls neither', async () => {
    fixture.log.registry.mount(fixture.notes.contribution)
    const reply = await call(fixture.port, 'read-note', { body: '{"noteId":"n-1"}' })
    expect(reply.status).toBe(404)
    expect(reply.text).toBe('{"kind":"not-executed","reason":"conflict"}')
    expect(reply.headers['content-type']).toBe('application/json; charset=utf-8')
    expect(fixture.diagnostics).toEqual([
      {
        code: 'access.protocol-conflict',
        path: '/api/notes/v1/read-note',
        protocol: 'notes',
        major: 1,
        operation: 'read-note',
        by: ['mount-1#1', 'mount-3#1'],
      },
    ])
    expect(fixture.log.entries).toEqual([])
  })

  it('serves again once one of the two is taken down', async () => {
    const takeSecond = fixture.log.registry.mount(fixture.notes.contribution)
    await takeSecond()
    const reply = await call(fixture.port, 'no-such-operation')
    expect(reply.text).toBe('{"kind":"not-executed","reason":"not-offered"}')
  })
})

describe('the other refusals of admission', () => {
  it('a protocol that is not mounted: 404 that says nothing ran, with its own reason', async () => {
    const reply = await send(fixture.port, '/api/ghost/v1/read', {
      headers: callHeaders(),
      body: '{}',
    })
    expect(reply.status).toBe(404)
    expect(reply.text).toBe('{"kind":"not-executed","reason":"not-mounted"}')
    expect(reply.headers['content-type']).toBe('application/json; charset=utf-8')
    expect(fixture.diagnostics.map(event => event.code)).toEqual(['access.not-mounted'])
  })

  it('another major of a mounted protocol is not mounted', async () => {
    const reply = await send(fixture.port, '/api/notes/v2/read-note', {
      headers: callHeaders(),
      body: '{}',
    })
    expect(reply.status).toBe(404)
    expect(reply.text).toBe('{"kind":"not-executed","reason":"not-mounted"}')
    expect(fixture.diagnostics.map(event => event.code)).toEqual(['access.not-mounted'])
  })

  it('a path outside the grammar: 404 with no body', async () => {
    const reply = await send(fixture.port, '/api/notes/read-note', { body: '{}' })
    expect(reply.status).toBe(404)
    expect(reply.text).toBe('')
    expect(fixture.diagnostics.map(event => event.code)).toEqual(['access.path-rejected'])
  })

  it('a method that is not POST on a name the protocol does not have: 405, judged first', async () => {
    const reply = await call(fixture.port, 'no-such-operation', { method: 'GET' })
    expect(reply.status).toBe(405)
    expect(reply.text).toBe('')
  })

  it('a protocol taken down answers not mounted, not not offered', async () => {
    await fixture.takeDown()
    const reply = await call(fixture.port, 'no-such-operation')
    expect(reply.status).toBe(404)
    expect(reply.text).toBe('{"kind":"not-executed","reason":"not-mounted"}')
    expect(fixture.diagnostics.map(event => event.code)).toEqual(['access.not-mounted'])
  })
})
