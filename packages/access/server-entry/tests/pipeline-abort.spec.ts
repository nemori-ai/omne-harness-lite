// Cut short (#1233 spec 已定 12, 13; C8, C13): a take-down answers a call waiting on the identity
// port or on its body at once; a caller who goes away gets no handler call before the handler
// starts and does not stop it after; stopping the entry waits for the calls in flight. The moments
// come from the test identity's and the handlers' own records, never from a timed wait.
import { getEventListeners } from 'node:events'
import { connect, type Socket } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ActForResult, LoginResult } from '@omne-harness/access-cordis-contract'
import {
  GRACE_MS,
  MESSAGE_ID,
  PROOF,
  call,
  held,
  rawHeaders,
  startAccessFixture,
  turn,
  type AccessFixture,
} from './support/pipeline-kit.ts'

let fixture: AccessFixture

beforeEach(async () => {
  fixture = await startAccessFixture()
})

afterEach(async () => {
  await fixture.stop()
})

type OpenCall = {
  readonly socket: Socket
  /** Everything the server wrote, once it ends the connection. */
  readonly reply: Promise<string>
}

/** Sends the request head and `sent` bytes of the body, and keeps the connection open. */
function openCall(name: string, body: string, sent: number): Promise<OpenCall> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port: fixture.port }, () => {
      const head = [`POST /api/notes/v1/${name} HTTP/1.1`, ...rawHeaders(body.length), '', ''].join(
        '\r\n',
      )
      socket.write(head + body.slice(0, sent))
      resolve({ socket, reply })
    })
    const chunks: Buffer[] = []
    socket.on('data', (chunk: Buffer) => chunks.push(chunk))
    const reply = new Promise<string>(settle => {
      socket.on('close', () => settle(Buffer.concat(chunks).toString('utf8')))
    })
    socket.on('error', reject)
  })
}

/** Lets the event loop turn until `ready` holds. Bounded by the case's time limit, not by a clock. */
async function until(ready: () => boolean): Promise<void> {
  while (!ready()) await turn()
}

const UNAVAILABLE = '{"outcome":"basis-unavailable","body":{}}'

describe('C8: a take-down answers a waiting call at once', () => {
  it('while the identity port has not returned', async () => {
    fixture.accessIdentity.identifyLogin = { kind: 'hold', held: held<LoginResult>() }
    const reply = call(fixture.port, 'read-note', { body: '{"noteId":"n-1"}' })
    await fixture.accessIdentity.called('identifyLogin')

    const takenDown = fixture.takeDown()
    const answered = await reply
    expect(answered.status).toBe(503)
    expect(answered.text).toBe(UNAVAILABLE)
    expect(answered.headers['omne-message-id']).toBe(MESSAGE_ID)
    expect(answered.headers.connection).toBe('close')
    await takenDown
    expect(fixture.notes.calls).toEqual([])
  })

  it('while actFor has not returned', async () => {
    fixture.accessIdentity.actFor = { kind: 'hold', held: held<ActForResult>() }
    const reply = call(fixture.port, 'save-note', { body: '{"noteId":"n-1","title":"t"}' })
    await fixture.accessIdentity.called('actFor')

    const takenDown = fixture.takeDown()
    expect((await reply).text).toBe(UNAVAILABLE)
    await takenDown
    expect(fixture.notes.calls).toEqual([])
  })

  it('a handler that ignores the abort is answered by its effect once the grace has passed', async () => {
    fixture.notes.scripts['read-note'] = () => new Promise(() => {})
    fixture.notes.scripts['save-note'] = () => new Promise(() => {})
    const read = call(fixture.port, 'read-note', { body: '{"noteId":"n-1"}' })
    const commit = call(fixture.port, 'save-note', { body: '{"noteId":"n-1","title":"t"}' })
    await fixture.notes.called(2)

    const takenDown = fixture.takeDown()
    fixture.accessClock.advance(GRACE_MS - 1)
    await turn()
    expect(fixture.log.entries.every(line => !line.left)).toBe(true)
    fixture.accessClock.advance(1)
    expect((await read).text).toBe(UNAVAILABLE)
    expect((await commit).text).toBe('{"outcome":"unknown","body":{}}')
    await takenDown
  })

  it('while half of the body has arrived and the identity port has returned', async () => {
    const body = '{"noteId":"n-1"}'
    const open = await openCall('read-note', body, 8)
    await fixture.accessIdentity.returned('identifyLogin')
    await turn()

    const takenDown = fixture.takeDown()
    const text = await open.reply
    expect(text).toMatch(/^HTTP\/1\.1 503 /)
    expect(text.endsWith(UNAVAILABLE)).toBe(true)
    await takenDown
    expect(fixture.notes.calls).toEqual([])
  })
})

describe('C8: the caller goes away', () => {
  it('before the identity port returns: no handler call, and the take-down completes', async () => {
    const recognised = held<LoginResult>()
    fixture.accessIdentity.identifyLogin = { kind: 'hold', held: recognised }
    const body = '{"noteId":"n-1"}'
    const open = await openCall('read-note', body, body.length)
    await fixture.accessIdentity.called('identifyLogin')

    open.socket.destroy()
    await until(() => fixture.diagnostics.some(event => event.code === 'access.caller-gone'))
    const login = fixture.accessIdentity.logins.get(PROOF)
    if (login === undefined) throw new Error('the proof has no login')
    recognised.resolve({ outcome: 'identified', login })

    await fixture.takeDown()
    expect(fixture.notes.calls).toEqual([])
    expect(fixture.log.entries).toEqual([{ name: 'read-note', left: true }])
  })

  it('after the handler starts: the handler runs to its end unaborted, and the take-down completes', async () => {
    const answer = held<{ outcome: 'succeeded'; body: { noteId: string; title: string } }>()
    let abortedAtEnd: boolean | undefined
    fixture.notes.scripts['read-note'] = async callContext => {
      const value = await answer.promise
      abortedAtEnd = callContext.signal.aborted
      return value
    }
    const body = '{"noteId":"n-1"}'
    const open = await openCall('read-note', body, body.length)
    await fixture.notes.called()

    open.socket.destroy()
    await open.reply
    for (let round = 0; round < 5; round += 1) await turn()
    expect(fixture.log.entries).toEqual([{ name: 'read-note', left: false }])

    answer.resolve({ outcome: 'succeeded', body: { noteId: 'n-1', title: 't' } })
    await until(() => fixture.log.entries[0]?.left === true)
    expect(abortedAtEnd).toBe(false)
    await fixture.takeDown()
  })
})

describe('the abort signal keeps no listener of a finished call', () => {
  it('after calls that succeed, are refused, are rejected and are cut short', async () => {
    await call(fixture.port, 'read-note', { body: '{"noteId":"n-1"}' })
    await call(fixture.port, 'save-note', { body: '{"noteId":"n-1","title":"t"}' })
    await call(fixture.port, 'read-note', {
      headers: { authorization: 'Bearer unknown-proof' },
      body: '{"noteId":"n-1"}',
    })
    await call(fixture.port, 'read-note', { body: '{' })
    const recognised = held<LoginResult>()
    fixture.accessIdentity.identifyLogin = { kind: 'hold', held: recognised }
    const body = '{"noteId":"n-1"}'
    const open = await openCall('read-note', body, body.length)
    await fixture.accessIdentity.called('identifyLogin', 5)
    open.socket.destroy()
    await until(() => fixture.diagnostics.some(event => event.code === 'access.caller-gone'))

    expect(fixture.log.signals.size).toBe(1)
    for (const signal of fixture.log.signals) expect(getEventListeners(signal, 'abort')).toEqual([])
  })
})

describe('C13: stopping the entry waits for the calls at the new address', () => {
  it('stop settles only after the handler in flight has answered', async () => {
    const answer = held<{ outcome: 'succeeded'; body: { noteId: string; title: string } }>()
    fixture.notes.scripts['read-note'] = () => answer.promise
    const reply = call(fixture.port, 'read-note', { body: '{"noteId":"n-1"}' })
    await fixture.notes.called()

    let stopped = false
    const stopping = fixture.stop().then(() => {
      stopped = true
    })
    for (let round = 0; round < 5; round += 1) await turn()
    expect(stopped).toBe(false)

    answer.resolve({ outcome: 'succeeded', body: { noteId: 'n-1', title: 't' } })
    expect((await reply).status).toBe(200)
    await stopping
    expect(stopped).toBe(true)
  })
})
