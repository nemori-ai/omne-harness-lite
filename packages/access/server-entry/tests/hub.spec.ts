// The observation hub at the new address (#1249 block 1, C1 to C5): an observation goes through
// the whole pipeline and then the hub; the hub keeps the two bounds, the slot before the stream,
// replacement, one login check per round, the heartbeat, the frame queue bound and the `ended`
// frame; it calls `leave` once on every way an observation ends. The frame source of each case is
// a feed the case drives; moments come from its records, not from a timed wait.
import { connect, type Socket } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import type { SseClient } from './support/harness.ts'
import {
  GRACE_MS,
  MESSAGE_ID,
  OTHER_PROOF,
  PROOF,
  TENANT,
  call,
  held,
  observe,
  rawCall,
  rawHeaders,
  startAccessFixture,
  turn,
  type AccessFixture,
  type ApiOptions,
  type Feed,
} from './support/pipeline-kit.ts'

const fixtures: AccessFixture[] = []
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(fixture => fixture.stop()))
})

async function entry(config?: Parameters<typeof startAccessFixture>[0]): Promise<AccessFixture> {
  const fixture = await startAccessFixture(config)
  fixtures.push(fixture)
  return fixture
}

async function until(ready: () => boolean): Promise<void> {
  while (!ready()) await turn()
}

type HubEvent = { kind: 'frame'; frame: unknown } | { kind: 'ended'; reason: string }

/** Waits for the stream to end and answers its events. */
async function endedEvents(client: SseClient): Promise<readonly HubEvent[]> {
  await client.ended
  return client.events() as HubEvent[]
}

const NOTE = { noteId: 'n-1', title: 'first note' }

function open(fixture: AccessFixture, name = 'watch-note', options: ApiOptions = {}): SseClient {
  return observe(fixture.port, name, options)
}

/** An observation whose client reads nothing: the socket is paused once the head arrives. */
function pausedObserver(fixture: AccessFixture, name: string, body = '{"noteId":"n-1"}'): Socket {
  const socket = connect({ host: '127.0.0.1', port: fixture.port }, () => {
    socket.write(
      [
        `POST /api/notes/v1/${name} HTTP/1.1`,
        ...rawHeaders(Buffer.byteLength(body)),
        '',
        body,
      ].join('\r\n'),
    )
  })
  socket.once('data', () => socket.pause())
  socket.on('error', () => {})
  return socket
}

describe('C1: an observation goes through the whole pipeline', () => {
  it('opens an event stream: the head, the frames by the contract, and the ended frame', async () => {
    const fixture = await entry()
    const client = open(fixture)
    expect(await client.status).toBe(200)
    const headers = await client.headers
    expect(headers['content-type']).toBe('text/event-stream; charset=utf-8')
    expect(headers['cache-control']).toBe('no-store')
    expect(headers['omne-message-id']).toBe(MESSAGE_ID)
    const feed = await fixture.notes.opened(1)
    expect(feed.open).toEqual({ noteId: 'n-1' })
    feed.push(NOTE)
    feed.finish('note-deleted')
    expect(await endedEvents(client)).toEqual([
      { kind: 'frame', frame: NOTE },
      { kind: 'ended', reason: 'note-deleted' },
    ])
    await until(() => fixture.log.entries[0]?.left === true)
    expect(fixture.log.leaveCounts).toEqual([1])
  })

  it('answers 404 without reading the body when the observation or its protocol is not mounted', async () => {
    const fixture = await entry()
    for (const target of ['/api/notes/v1/watch-nothing', '/api/other/v1/watch-note']) {
      const reply = await rawCall(fixture.port, target, rawHeaders(100))
      expect(reply).toMatch(/^HTTP\/1\.1 404 /)
      expect(reply).toMatch(/\r\nconnection: close\r\n/i)
    }
    await fixture.takeDown()
    expect((await call(fixture.port, 'watch-note', { body: '{"noteId":"n-1"}' })).status).toBe(404)
    expect(fixture.notes.feeds).toEqual([])
  })

  it('answers denied before the body is read when there is no login, and closes the connection', async () => {
    const fixture = await entry()
    const lines = rawHeaders(10 * 1024 * 1024).filter(line => !line.startsWith('Authorization'))
    const reply = await rawCall(fixture.port, '/api/notes/v1/watch-note', lines)
    expect(reply).toMatch(/^HTTP\/1\.1 403 /)
    expect(reply).toMatch(/\r\nconnection: close\r\n/i)
    expect(reply.endsWith('{"outcome":"denied","body":{}}')).toBe(true)
    expect(fixture.notes.feeds).toEqual([])
  })

  it('answers the denied of an observation with the same bytes as the denied of an operation', async () => {
    const fixture = await entry()
    const bad = { authorization: `Bearer ${PROOF}-unknown` }
    const watched = await call(fixture.port, 'watch-note', {
      headers: bad,
      body: '{"noteId":"n-1"}',
    })
    const read = await call(fixture.port, 'read-note', { headers: bad, body: '{"noteId":"n-1"}' })
    expect(watched.status).toBe(403)
    const strip = (headers: Record<string, unknown>) => ({ ...headers, date: undefined })
    expect(strip(watched.headers)).toEqual(strip(read.headers))
    expect(watched.text).toBe(read.text)
  })

  it('answers protocol-rejected to an opening body over its limit or outside the contract', async () => {
    const fixture = await entry()
    const over = await call(fixture.port, 'watch-note', {
      body: JSON.stringify({ noteId: 'x'.repeat(3000) }),
    })
    expect(over.status).toBe(400)
    expect(over.json).toEqual({ outcome: 'protocol-rejected', body: {} })
    // `watch-tenant` takes the input limit: the same size opens.
    const big = open(fixture, 'watch-tenant', {
      body: JSON.stringify({ noteId: 'x'.repeat(3000) }),
    })
    expect(await big.status).toBe(200)
    big.close()
    const outside = await call(fixture.port, 'watch-note', { body: '{"noteId":"n-1","extra":1}' })
    expect(outside.status).toBe(400)
    expect(outside.json).toEqual({ outcome: 'protocol-rejected', body: {} })
  })
})

describe('C2: the hub keeps its behaviour at the new address', () => {
  it('bounds the observations of one login', async () => {
    const fixture = await entry({
      config: { observation: { perLogin: 2, perInstance: 8, cancelRetentionMs: 0 } },
    })
    const first = open(fixture, 'watch-note', { headers: { 'omne-message-id': 'm-1' } })
    const second = open(fixture, 'watch-note', { headers: { 'omne-message-id': 'm-2' } })
    await fixture.notes.opened(2)
    const third = await call(fixture.port, 'watch-note', {
      headers: { 'omne-message-id': 'm-3' },
      body: '{"noteId":"n-1"}',
    })
    expect(third.status).toBe(503)
    expect(third.json).toEqual({ outcome: 'basis-unavailable', body: {} })
    expect(third.headers.connection).not.toBe('close')
    // Another login still has room.
    const other = open(fixture, 'watch-note', {
      headers: { authorization: `Bearer ${OTHER_PROOF}` },
    })
    expect(await other.status).toBe(200)
    fixture.notes.feeds[0]!.finish('note-deleted')
    await first.ended
    const fourth = open(fixture, 'watch-note', { headers: { 'omne-message-id': 'm-4' } })
    expect(await fourth.status).toBe(200)
    for (const client of [second, other, fourth]) client.close()
  })

  it('bounds the observations of the instance', async () => {
    const fixture = await entry({
      config: { observation: { perLogin: 8, perInstance: 2, cancelRetentionMs: 0 } },
    })
    const a = open(fixture, 'watch-note', { headers: { 'omne-message-id': 'm-1' } })
    const b = open(fixture, 'watch-note', { headers: { authorization: `Bearer ${OTHER_PROOF}` } })
    await fixture.notes.opened(2)
    const c = await call(fixture.port, 'watch-all', { body: '{}' })
    expect(c.status).toBe(503)
    a.close()
    b.close()
  })

  it('takes the slot before the frame source has decided', async () => {
    const fixture = await entry({
      config: { observation: { perLogin: 1, perInstance: 8, cancelRetentionMs: 0 } },
    })
    const deciding = held<never>()
    fixture.notes.sources['watch-note'] = () => deciding.promise
    const first = open(fixture, 'watch-note', { headers: { 'omne-message-id': 'm-1' } })
    await until(() => fixture.log.entries.length === 1)
    await turn()
    const second = await call(fixture.port, 'watch-note', {
      headers: { 'omne-message-id': 'm-2' },
      body: '{"noteId":"n-1"}',
    })
    expect(second.status).toBe(503)
    first.close()
  })

  it('replaces the observation of the same login and message id, and only that one', async () => {
    const fixture = await entry()
    const old = open(fixture)
    await fixture.notes.opened(1)
    const otherLogin = open(fixture, 'watch-note', {
      headers: { authorization: `Bearer ${OTHER_PROOF}` },
    })
    await fixture.notes.opened(2)
    const renewed = open(fixture)
    await fixture.notes.opened(3)
    expect(await endedEvents(old)).toEqual([{ kind: 'ended', reason: 'observer-replaced' }])
    fixture.notes.feeds[2]!.push(NOTE)
    expect(await renewed.waitForEvents(1)).toEqual([{ kind: 'frame', frame: NOTE }])
    expect(otherLogin.events()).toEqual([])
    // The same login with another message id is another observation.
    const another = open(fixture, 'watch-note', { headers: { 'omne-message-id': 'm-other' } })
    await fixture.notes.opened(4)
    fixture.notes.feeds[2]!.push(NOTE)
    expect(await renewed.waitForEvents(2)).toEqual([
      { kind: 'frame', frame: NOTE },
      { kind: 'frame', frame: NOTE },
    ])
    expect(another.events()).toEqual([])
    renewed.close()
    otherLogin.close()
    another.close()
  })

  it('checks the login each round, by the same proof, and ends on a revoked or unjudgeable login', async () => {
    const fixture = await entry()
    const revoked = open(fixture, 'watch-tenant', { headers: { 'omne-message-id': 'm-1' } })
    await fixture.notes.opened(1)
    const opening = fixture.accessIdentity.calls.length
    // Two rounds later: only identifyLogin was asked again, by the same proof; actFor once, at the opening.
    await fixture.accessIdentity.called('identifyLogin', 3)
    const rounds = fixture.accessIdentity.calls.slice(opening)
    expect(rounds.every(entry => entry.method === 'identifyLogin' && entry.proof === PROOF)).toBe(
      true,
    )
    expect(fixture.accessIdentity.calls.filter(entry => entry.method === 'actFor')).toHaveLength(1)
    fixture.accessIdentity.identifyLogin = { kind: 'answer', value: { outcome: 'denied' } }
    expect(await endedEvents(revoked)).toEqual([{ kind: 'ended', reason: 'denied' }])

    delete fixture.accessIdentity.identifyLogin
    const unjudged = open(fixture, 'watch-note', { headers: { 'omne-message-id': 'm-2' } })
    await fixture.notes.opened(2)
    fixture.accessIdentity.identifyLogin = {
      kind: 'answer',
      value: { outcome: 'basis-unavailable' },
    }
    expect(await endedEvents(unjudged)).toEqual([{ kind: 'ended', reason: 'unavailable' }])
  })

  it('ends every observation of a revoked login, and only those', async () => {
    const fixture = await entry()
    const mine = [
      open(fixture, 'watch-note', { headers: { 'omne-message-id': 'm-1' } }),
      open(fixture, 'watch-tenant', { headers: { 'omne-message-id': 'm-2' } }),
    ]
    const theirs = open(fixture, 'watch-note', {
      headers: { authorization: `Bearer ${OTHER_PROOF}` },
    })
    await fixture.notes.opened(3)
    // The login of PROOF is revoked: the identity no longer recognises it.
    ;(fixture.accessIdentity.logins as Map<string, unknown>).delete(PROOF)
    for (const client of mine)
      expect(await endedEvents(client)).toEqual([{ kind: 'ended', reason: 'denied' }])
    const rounds = fixture.accessIdentity.calls.length
    await fixture.accessIdentity.called('identifyLogin', rounds + 2)
    expect(theirs.events()).toEqual([])
    theirs.close()
  })

  it('writes a heartbeat while no frame comes', async () => {
    const fixture = await entry()
    const client = open(fixture)
    await fixture.notes.opened(1)
    await client.waitForText(': heartbeat\n\n')
    expect(client.events()).toEqual([])
    client.close()
  })
})

describe('C3: the frame source', () => {
  it('gets the principal the port issued, the opening value and the message id', async () => {
    const fixture = await entry()
    const client = open(fixture, 'watch-tenant')
    const feed = await fixture.notes.opened(1)
    const login = fixture.accessIdentity.logins.get(PROOF)!
    expect(feed.context.principal).toBe(fixture.accessIdentity.principalOf(login, TENANT))
    expect(feed.context.messageId).toBe(MESSAGE_ID)
    expect(feed.open).toEqual({ noteId: 'n-1' })
    client.close()
  })

  it('ends with its own reason when it finishes', async () => {
    const fixture = await entry()
    const client = open(fixture)
    const feed = await fixture.notes.opened(1)
    feed.finish('note-deleted')
    expect(await endedEvents(client)).toEqual([{ kind: 'ended', reason: 'note-deleted' }])
  })

  it('ends with denied or unavailable of its own, without a fault', async () => {
    const fixture = await entry()
    const denied = open(fixture, 'watch-note', { headers: { 'omne-message-id': 'm-1' } })
    ;(await fixture.notes.opened(1)).finish('denied')
    expect(await endedEvents(denied)).toEqual([{ kind: 'ended', reason: 'denied' }])
    const unavailable = open(fixture, 'watch-note', { headers: { 'omne-message-id': 'm-2' } })
    ;(await fixture.notes.opened(2)).finish('unavailable')
    expect(await endedEvents(unavailable)).toEqual([{ kind: 'ended', reason: 'unavailable' }])
    expect(fixture.diagnostics.map(event => event.code)).not.toContain('access.frame-source-fault')
    // A reason that is not even text is a fault.
    const numeric = open(fixture, 'watch-note', { headers: { 'omne-message-id': 'm-3' } })
    ;(await fixture.notes.opened(3)).finish(42 as unknown as string)
    expect(await endedEvents(numeric)).toEqual([{ kind: 'ended', reason: 'unavailable' }])
    expect(fixture.diagnostics.map(event => event.code)).toEqual(['access.frame-source-fault'])
  })

  it('ends with unavailable when it throws, gives a frame outside the contract, or ends with a reason outside its ends', async () => {
    const fixture = await entry()
    const thrown = open(fixture, 'watch-note', { headers: { 'omne-message-id': 'm-1' } })
    ;(await fixture.notes.opened(1)).fail()
    expect(await endedEvents(thrown)).toEqual([{ kind: 'ended', reason: 'unavailable' }])

    const malformed = open(fixture, 'watch-note', { headers: { 'omne-message-id': 'm-2' } })
    ;(await fixture.notes.opened(2)).push({ noteId: 7 })
    expect(await endedEvents(malformed)).toEqual([{ kind: 'ended', reason: 'unavailable' }])

    const stray = open(fixture, 'watch-note', { headers: { 'omne-message-id': 'm-3' } })
    ;(await fixture.notes.opened(3)).finish('note-archived')
    expect(await endedEvents(stray)).toEqual([{ kind: 'ended', reason: 'unavailable' }])

    const codes = fixture.diagnostics.map(event => event.code)
    expect(codes.filter(code => code === 'access.frame-source-fault')).toHaveLength(2)
    expect(codes).toContain('access.frame-rejected')
  })

  it('is aborted and winds down when the observer goes away', async () => {
    const fixture = await entry()
    const client = open(fixture)
    const feed = await fixture.notes.opened(1)
    client.close()
    await feed.returned
    expect(feed.context.signal.aborted).toBe(true)
    await until(() => fixture.log.entries[0]?.left === true)
    expect(fixture.log.leaveCounts).toEqual([1])
  })

  it('answers the refusals of its decision like an operation, and nothing is streamed', async () => {
    const fixture = await entry()
    const cases = [
      [async () => ({ outcome: 'denied' as const }), 403, 'denied'],
      [async () => ({ outcome: 'invalid' as const }), 422, 'invalid'],
      [async () => ({ outcome: 'basis-unavailable' as const }), 503, 'basis-unavailable'],
      [async () => Promise.reject(new Error(`fault ${PROOF}`)), 503, 'basis-unavailable'],
    ] as const
    const body = '{"noteId":"n-1"}'
    for (const [source, status, outcome] of cases) {
      fixture.notes.sources['watch-note'] = source
      const reply = await call(fixture.port, 'watch-note', { body })
      expect([reply.status, reply.json]).toEqual([status, { outcome, body: {} }])
      expect(reply.headers.connection === 'close').toBe(outcome === 'denied')
    }
    // A denied answer closes the connection: the raw reply ends, and says so.
    fixture.notes.sources['watch-note'] = cases[0][0]
    const head = await rawCall(
      fixture.port,
      '/api/notes/v1/watch-note',
      rawHeaders(Buffer.byteLength(body)),
      body,
    )
    expect(head).toMatch(/\r\nconnection: close\r\n/i)
    expect(fixture.log.leaveCounts).toEqual([1, 1, 1, 1, 1])
    expect(fixture.diagnostics.map(event => event.code)).toEqual(['access.frame-source-fault'])
  })

  it('aborts a frame source that is still deciding when the caller goes away', async () => {
    const fixture = await entry()
    let signal: AbortSignal | undefined
    fixture.notes.sources['watch-note'] = async context => {
      signal = context.signal
      return new Promise(() => {})
    }
    const client = open(fixture)
    await until(() => signal !== undefined)
    client.close()
    await until(() => signal?.aborted === true)
    await until(() => fixture.log.entries[0]?.left === true)
    expect(fixture.log.leaveCounts).toEqual([1])
  })
})

describe('C4: the frame queue bound', () => {
  /** Pushes a 16 KiB frame each millisecond until the source is aborted or `limit` frames went out. */
  async function flood(feed: Feed, limit: number): Promise<number> {
    const title = 'x'.repeat(16 * 1024)
    let pushed = 0
    while (!feed.context.signal.aborted && pushed < limit) {
      feed.push({ noteId: 'n-1', title })
      pushed += 1
      await new Promise(resolve => setTimeout(resolve, 1))
    }
    return pushed
  }

  it('keeps an observation whose observer reads, at the same pace', async () => {
    const fixture = await entry()
    const client = open(fixture)
    const feed = await fixture.notes.opened(1)
    expect(await flood(feed, 200)).toBe(200)
    expect(feed.context.signal.aborted).toBe(false)
    client.close()
  })

  it('ends an observation whose observer reads nothing once its frames pass the bound', async () => {
    const fixture = await entry()
    const socket = pausedObserver(fixture, 'watch-note')
    const feed = await fixture.notes.opened(1)
    await flood(feed, 20_000)
    expect(feed.context.signal.aborted).toBe(true)
    await until(() => fixture.log.entries[0]?.left === true)
    expect(fixture.log.leaveCounts).toEqual([1])
    expect(fixture.diagnostics.map(event => event.code)).toContain('access.frame-queue-full')
    socket.destroy()
  })
})

describe('C5: a take-down ends every observation, and completes after their ended frames', () => {
  it('when the take-down completes, every observation of it has received its ended frame', async () => {
    const fixture = await entry()
    const clients = [
      open(fixture, 'watch-note', { headers: { 'omne-message-id': 'm-1' } }),
      open(fixture, 'watch-tenant', { headers: { 'omne-message-id': 'm-2' } }),
    ]
    await fixture.notes.opened(2)
    const done = fixture.takeDown()
    // The take-down has begun but no `ended` frame is written out yet: nobody has left.
    expect(fixture.log.entries.map(line => line.left)).toEqual([false, false])
    await done
    for (const client of clients)
      expect(await endedEvents(client)).toEqual([{ kind: 'ended', reason: 'unavailable' }])
    expect(fixture.log.leaveCounts).toEqual([1, 1])
  })

  it('waits for an ended frame that cannot be written out until the grace runs out', async () => {
    // The frame queue bound is far away, so the observer that reads nothing is not cut off.
    const fixture = await entry({ frameQueueBytes: 1 << 30 })
    const socket = pausedObserver(fixture, 'watch-note')
    const feed = await fixture.notes.opened(1)
    const title = 'x'.repeat(16 * 1024)
    // 32 MiB more than any socket buffer takes: the rest waits in the writer.
    for (let index = 0; index < 2048; index += 1) feed.push({ noteId: 'n-1', title })
    await until(() => feed.taken === 2048)
    let completed = false
    const done = fixture.takeDown().then(() => {
      completed = true
    })
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(completed).toBe(false)
    expect(fixture.log.entries[0]?.left).toBe(false)
    fixture.accessClock.advance(GRACE_MS)
    await done
    expect(fixture.log.leaveCounts).toEqual([1])
    // The connection was cut: reading the rest ends without the `ended` frame.
    let tail = ''
    let closed = false
    socket.on('data', (chunk: Buffer) => {
      tail = (tail + chunk.toString('latin1')).slice(-256)
    })
    socket.once('close', () => {
      closed = true
    })
    socket.resume()
    await until(() => closed)
    expect(tail).not.toContain('"kind":"ended"')
  })

  it('calls leave once on each way an observation ends', async () => {
    const fixture = await entry({
      config: { observation: { perLogin: 1, perInstance: 8, cancelRetentionMs: 0 } },
    })
    // Full: the second of one login.
    const holder = open(fixture, 'watch-note', { headers: { 'omne-message-id': 'm-1' } })
    await fixture.notes.opened(1)
    await call(fixture.port, 'watch-note', {
      headers: { 'omne-message-id': 'm-2' },
      body: '{"noteId":"n-1"}',
    })
    // Replaced, then ended by its own reason.
    const replacing = open(fixture, 'watch-note', { headers: { 'omne-message-id': 'm-1' } })
    await endedEvents(holder)
    ;(await fixture.notes.opened(2)).finish('note-deleted')
    await endedEvents(replacing)
    // Cancelled by the observer.
    const leaving = open(fixture, 'watch-all', { body: '{}' })
    await fixture.notes.opened(3)
    leaving.close()
    // Denied at the round.
    const revoked = open(fixture, 'watch-note', { headers: { 'omne-message-id': 'm-3' } })
    await fixture.notes.opened(4)
    fixture.accessIdentity.identifyLogin = { kind: 'answer', value: { outcome: 'denied' } }
    await endedEvents(revoked)
    delete fixture.accessIdentity.identifyLogin
    // Stopped with the entry.
    const stopped = open(fixture, 'watch-all', { body: '{}' })
    await fixture.notes.opened(5)
    await fixture.stop()
    expect(await endedEvents(stopped)).toEqual([{ kind: 'ended', reason: 'unavailable' }])
    await until(() => fixture.log.entries.every(line => line.left))
    expect(fixture.log.leaveCounts.every(count => count === 1)).toBe(true)
    expect(fixture.log.leaveCounts).toHaveLength(6)
  })
})

describe('C6: the business access and what stays out of every output', () => {
  it('reports a business access once, after the first frame, only for an observation that counts', async () => {
    const fixture = await entry()
    const reports = () =>
      fixture.accessIdentity.calls.filter(line => line.method === 'reportAccess')
    const counted = open(fixture, 'watch-tenant', { headers: { 'omne-message-id': 'm-1' } })
    const feed = await fixture.notes.opened(1)
    await turn()
    expect(reports()).toEqual([])
    feed.push(NOTE)
    await counted.waitForEvents(1)
    expect(reports()).toEqual([
      { method: 'reportAccess', login: fixture.accessIdentity.logins.get(PROOF) },
    ])
    feed.push(NOTE)
    await counted.waitForEvents(2)
    expect(reports()).toHaveLength(1)
    // Not marked, or no login: no report.
    const plain = open(fixture, 'watch-note', { headers: { 'omne-message-id': 'm-2' } })
    ;(await fixture.notes.opened(2)).push(NOTE)
    await plain.waitForEvents(1)
    const anonymous = open(fixture, 'watch-all', { body: '{}' })
    ;(await fixture.notes.opened(3)).push(NOTE)
    await anonymous.waitForEvents(1)
    expect(reports()).toHaveLength(1)
    for (const client of [counted, plain, anonymous]) client.close()
  })

  it('keeps the frames going when the report fails, with one diagnostic', async () => {
    const fixture = await entry()
    fixture.accessIdentity.reportAccess = { kind: 'reject' }
    const client = open(fixture, 'watch-tenant')
    const feed = await fixture.notes.opened(1)
    feed.push(NOTE)
    await fixture.accessIdentity.returned('reportAccess')
    feed.push(NOTE)
    feed.finish('note-deleted')
    expect(await endedEvents(client)).toEqual([
      { kind: 'frame', frame: NOTE },
      { kind: 'frame', frame: NOTE },
      { kind: 'ended', reason: 'note-deleted' },
    ])
    expect(fixture.diagnostics.filter(event => event.code === 'access.report-fault')).toHaveLength(
      1,
    )
  })

  it('keeps the proof, the tenant text and the opening body out of every frame, answer and diagnostic', async () => {
    const tenantText = 'TENANT-HEADER-41aa'
    const bodyMarker = 'BODY-MARKER-77c0'
    const fixture = await entry({
      config: { observation: { perLogin: 1, perInstance: 8, cancelRetentionMs: 0 } },
    })
    const headers = (id: string) => ({ 'omne-acting-tenant': tenantText, 'omne-message-id': id })
    const body = `{"noteId":"${bodyMarker}"}`
    const outputs: string[] = []
    const keep = async (client: SseClient) => {
      await client.ended
      outputs.push(
        `${await client.status} ${JSON.stringify(await client.headers)} ${client.chunks.join('')}`,
      )
    }
    // A frame source fault at the decision, and one while streaming.
    fixture.notes.sources['watch-tenant'] = async () => {
      throw new Error(`source fault ${PROOF} ${tenantText} ${bodyMarker}`)
    }
    const refused = open(fixture, 'watch-tenant', { headers: headers('m-1'), body })
    await keep(refused)
    delete fixture.notes.sources['watch-tenant']
    const faulty = open(fixture, 'watch-tenant', { headers: headers('m-2'), body })
    const feed = await fixture.notes.opened(1)
    feed.push(NOTE)
    // The slot of this login is taken: a second one is full.
    const full = open(fixture, 'watch-tenant', { headers: headers('m-3'), body })
    await keep(full)
    feed.push({ noteId: 7 })
    await keep(faulty)
    // The queue bound, against an observer that reads nothing.
    const socket = pausedObserver(fixture, 'watch-tenant', body)
    const flooded = await fixture.notes.opened(2)
    const title = 'x'.repeat(16 * 1024)
    while (!flooded.context.signal.aborted) {
      flooded.push({ noteId: 'n-1', title })
      await new Promise(resolve => setTimeout(resolve, 1))
    }
    socket.destroy()

    const hubCodes = [
      'access.frame-source-fault',
      'access.frame-rejected',
      'access.observation-full',
      'access.frame-queue-full',
    ]
    const events = fixture.diagnostics.filter(event => hubCodes.includes(event.code))
    expect(new Set(events.map(event => event.code))).toEqual(new Set(hubCodes))
    const allowed = new Set(['code', 'path', 'protocol', 'major', 'operation'])
    for (const event of events)
      expect(Object.keys(event).filter(key => !allowed.has(key))).toEqual([])
    const haystack = [...outputs, JSON.stringify(fixture.diagnostics)].join('\n')
    expect(haystack).toContain('"kind":"frame"')
    for (const secret of [PROOF, tenantText, bodyMarker]) expect(haystack).not.toContain(secret)
  })
})
