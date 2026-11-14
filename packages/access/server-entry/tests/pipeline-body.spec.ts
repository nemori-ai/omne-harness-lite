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
const SIZE = 3000

let fixture: AccessFixture

beforeEach(async () => {
  fixture = await startAccessFixture()
})

afterEach(async () => {
  await fixture.stop()
})

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

  it('a body of exactly the limit is taken', async () => {
    const exact = padded('{"noteId":', 2048)
    expect(Buffer.byteLength(exact)).toBe(2048)
    const reply = await call(fixture.port, 'read-note', { body: exact })
    expect(reply.status).toBe(200)
  })

  it('a body with no declared length is counted as it arrives', async () => {
    const body = padded('{"noteId":', SIZE)
    const chunk = `${body.length.toString(16)}\r\n${body}\r\n0\r\n\r\n`
    const headers = rawHeaders(0).filter(line => !line.startsWith('Content-Length'))
    const reply = await rawCall(
      fixture.port,
      '/api/notes/v1/read-note',
      [...headers, 'Transfer-Encoding: chunked'],
      chunk,
    )
    expect(reply).toMatch(/^HTTP\/1\.1 400 /)
    expect(reply).toMatch(/\r\nconnection: close\r\n/i)
    expect(reply.endsWith(REJECTED)).toBe(true)
    expect(fixture.notes.calls).toEqual([])
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
