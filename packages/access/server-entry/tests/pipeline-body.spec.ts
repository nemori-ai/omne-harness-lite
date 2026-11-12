// Step 9 (#1233 spec 已定 10, C7): the body limit is the operation's, a body over it is
// protocol-rejected (400) with the connection closed, and the strict read rejects what the
// contract does not take.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  MESSAGE_ID,
  call,
  rawCall,
  rawHeaders,
  startAccessFixture,
  type AccessFixture,
} from './support/pipeline-kit.ts'

const REJECTED = '{"outcome":"protocol-rejected","body":{}}'
/** Over `maxBodyBytes.small` (2048 in the fixture), under `maxBodyBytes.input` (65536). */
const SIZE = 3000

let fixture: AccessFixture

beforeEach(async () => {
  fixture = await startAccessFixture()
})

afterEach(async () => {
  await fixture.stop()
})

/** A JSON text of exactly `size` bytes: the fields given, the last one padded. */
function padded(prefix: string, size: number): string {
  const text = `${prefix}"`
  return `${text}${'x'.repeat(size - text.length - 2)}"}`
}

describe('the limit is the operation’s', () => {
  it('a body over small is rejected for a small operation and taken by an input operation', async () => {
    const small = padded('{"noteId":', SIZE)
    const input = padded('{"noteId":"n-1","title":', SIZE)
    expect(Buffer.byteLength(small)).toBe(SIZE)
    expect(Buffer.byteLength(input)).toBe(SIZE)

    const over = await call(fixture.port, 'read-note', { body: small })
    expect(over.status).toBe(400)
    expect(over.text).toBe(REJECTED)
    expect(over.headers.connection).toBe('close')
    expect(over.headers['omne-message-id']).toBe(MESSAGE_ID)
    expect(fixture.notes.calls).toEqual([])

    const taken = await call(fixture.port, 'save-note', { body: input })
    expect(taken.status).toBe(200)
  })

  it('a declared length over the limit is answered without reading', async () => {
    const reply = await rawCall(fixture.port, '/api/notes/v1/read-note', rawHeaders(SIZE))
    expect(reply).toMatch(/^HTTP\/1\.1 400 /)
    expect(reply).toMatch(/\r\nconnection: close\r\n/i)
    expect(reply.endsWith(REJECTED)).toBe(true)
  })
})

describe('the strict read', () => {
  it.each([
    ['not JSON', '{"noteId":'],
    ['a repeated key', '{"noteId":"a","noteId":"b"}'],
    ['a field outside the contract', '{"noteId":"a","extra":1}'],
    ['a field of the wrong type', '{"noteId":1}'],
    ['no body', ''],
  ])('%s is protocol-rejected with the connection kept', async (_case, body) => {
    const reply = await call(fixture.port, 'read-note', { body })
    expect(reply.status).toBe(400)
    expect(reply.text).toBe(REJECTED)
    expect(reply.headers.connection).not.toBe('close')
    expect(reply.headers['omne-message-id']).toBe(MESSAGE_ID)
    expect(fixture.notes.calls).toEqual([])
    expect(fixture.log.entries.every(line => line.left)).toBe(true)
  })
})
