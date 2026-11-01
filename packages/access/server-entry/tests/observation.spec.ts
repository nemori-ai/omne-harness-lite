// SSE observation: the confirmation before any frame, heartbeats through the same serial writer,
// cancel and replacement, connection close as cancel, the hand-written closed read, and stop.
import { afterEach, describe, expect, it } from 'vitest'
import {
  SESSION_PATH,
  createSession,
  login,
  openSse,
  send,
  sessionMessage,
  sleep,
  startFixture,
  type Fixture,
  type Login,
} from './support/harness.ts'

let fixture: Fixture | undefined
afterEach(async () => {
  await fixture?.stop()
  fixture = undefined
})

function observe(who: Login, session: string, observationId = 'obs-1', messageId = 'm-o') {
  return sessionMessage(
    'observe-session',
    { tenant: who.tenantText, session, observationId },
    { loginProof: who.loginProof },
    messageId,
  )
}

function cancel(who: Login, session: string, observationId = 'obs-1', messageId = 'm-c') {
  return sessionMessage(
    'cancel-observation',
    { tenant: who.tenantText, session, observationId },
    { loginProof: who.loginProof },
    messageId,
  )
}

/** The byte positions of heartbeat lines never fall inside an event. */
function assertHeartbeatsOutsideEvents(text: string): void {
  const blocks = text.split('\n\n')
  for (const block of blocks) {
    if (block === '') continue
    expect(block === ': heartbeat' || (block.startsWith('data: ') && !block.includes('\n'))).toBe(
      true,
    )
  }
}

describe('establishing an observation', () => {
  it('answers an SSE whose first event is the four-key confirmation, then heartbeats, then the cancel frame', async () => {
    fixture = await startFixture({ config: { heartbeatIntervalMs: 30 } })
    const who = await login(fixture, 'alice')
    const session = await createSession(fixture, who)
    const stream = openSse(fixture.port, observe(who, session))
    expect(await stream.status).toBe(200)
    const headers = await stream.headers
    expect(headers['content-type']).toBe('text/event-stream; charset=utf-8')
    expect(headers['cache-control']).toBe('no-store')
    const [confirmation] = await stream.waitForEvents(1)
    expect(confirmation).toEqual({
      protocolVersion: 'session-public/1',
      messageId: 'm-o',
      outcome: 'succeeded',
      body: { observationId: 'obs-1' },
    })
    expect(stream.chunks.join('').startsWith('data: {"protocolVersion"')).toBe(true)
    await stream.waitForText(': heartbeat\n\n')
    await sleep(70)
    const beats = stream.chunks.join('').split(': heartbeat\n\n').length - 1
    expect(beats).toBeGreaterThanOrEqual(2)
    const cancelled = await send(fixture.port, SESSION_PATH, { body: cancel(who, session) })
    expect(cancelled.status).toBe(200)
    expect(cancelled.json).toEqual({
      protocolVersion: 'session-public/1',
      messageId: 'm-c',
      outcome: 'succeeded',
      body: { observationId: 'obs-1', state: 'ended' },
    })
    const events = await stream.waitForEvents(2)
    expect(events[1]).toEqual({
      protocolVersion: 'session-public/1',
      messageId: 'm-o',
      operation: 'observation-frame',
      body: {
        observationId: 'obs-1',
        seq: '1',
        frame: { kind: 'ended', reason: 'observer-cancelled' },
      },
    })
    await stream.ended
    assertHeartbeatsOutsideEvents(stream.chunks.join(''))
    const again = await send(fixture.port, SESSION_PATH, { body: cancel(who, session) })
    expect((again.json as { body: unknown }).body).toEqual({
      observationId: 'obs-1',
      state: 'ended',
    })
    await sleep(250)
    const late = await send(fixture.port, SESSION_PATH, { body: cancel(who, session) })
    expect((late.json as { body: unknown }).body).toEqual({
      observationId: 'obs-1',
      state: 'not-found',
    })
  })

  it('writes the confirmation before any frame even when a cancel races the Session read', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    fixture = await startFixture()
    const who = await login(fixture, 'alice')
    const session = await createSession(fixture, who)
    const faces = fixture.session.faces
    const slowBegin: typeof faces.history.begin = async input => {
      await gate
      return faces.history.begin(input)
    }
    const slow = { ...faces, history: { ...faces.history, begin: slowBegin } }
    const second = await startFixture({
      dependencies: { session: slow, identity: fixture.identity, issuer: fixture.issuer },
    })
    try {
      const stream = openSse(second.port, observe(who, session))
      await sleep(30)
      const early = await send(second.port, SESSION_PATH, { body: cancel(who, session) })
      expect((early.json as { body: unknown }).body).toEqual({
        observationId: 'obs-1',
        state: 'not-found',
      })
      release()
      // Cancel as soon as the observation exists, without waiting for the confirmation to arrive.
      let state = 'not-found'
      while (state !== 'ended') {
        const reply = await send(second.port, SESSION_PATH, { body: cancel(who, session) })
        state = (reply.json as { body: { state: string } }).body.state
      }
      const events = await stream.waitForEvents(2)
      expect((events[0] as { outcome: string }).outcome).toBe('succeeded')
      expect((events[1] as { operation: string }).operation).toBe('observation-frame')
    } finally {
      await second.stop()
    }
  })

  it('replaces an observation with the same observationId under the same login and ends the old stream', async () => {
    fixture = await startFixture()
    const who = await login(fixture, 'alice')
    const session = await createSession(fixture, who)
    const first = openSse(fixture.port, observe(who, session, 'obs-1', 'm-1'))
    await first.waitForEvents(1)
    const second = openSse(fixture.port, observe(who, session, 'obs-1', 'm-2'))
    const [confirmation] = await second.waitForEvents(1)
    expect((confirmation as { messageId: string }).messageId).toBe('m-2')
    const events = await first.waitForEvents(2)
    expect(events[1]).toEqual({
      protocolVersion: 'session-public/1',
      messageId: 'm-1',
      operation: 'observation-frame',
      body: {
        observationId: 'obs-1',
        seq: '1',
        frame: { kind: 'ended', reason: 'observer-replaced' },
      },
    })
    await first.ended
    second.close()
  })

  it('treats the connection close as the cancel and keeps the record for the retention', async () => {
    fixture = await startFixture({
      config: { observation: { perLogin: 2, perInstance: 8, cancelRetentionMs: 300 } },
    })
    const who = await login(fixture, 'alice')
    const session = await createSession(fixture, who)
    const stream = openSse(fixture.port, observe(who, session))
    await stream.waitForEvents(1)
    stream.close()
    await sleep(40)
    const cancelled = await send(fixture.port, SESSION_PATH, { body: cancel(who, session) })
    expect((cancelled.json as { body: unknown }).body).toEqual({
      observationId: 'obs-1',
      state: 'ended',
    })
    const fresh = openSse(fixture.port, observe(who, session, 'obs-1', 'm-n'))
    const [confirmation] = await fresh.waitForEvents(1)
    expect((confirmation as { messageId: string }).messageId).toBe('m-n')
    fresh.close()
  })

  it('answers basis-unavailable over the per-login capacity, not counting the replaced observation', async () => {
    fixture = await startFixture({
      config: { observation: { perLogin: 2, perInstance: 8, cancelRetentionMs: 100 } },
    })
    const who = await login(fixture, 'alice')
    const session = await createSession(fixture, who)
    const a = openSse(fixture.port, observe(who, session, 'obs-a'))
    const b = openSse(fixture.port, observe(who, session, 'obs-b'))
    await a.waitForEvents(1)
    await b.waitForEvents(1)
    const c = openSse(fixture.port, observe(who, session, 'obs-c'))
    expect(await c.status).toBe(503)
    const [refused] = await c.waitForEvents(1)
    expect(refused).toEqual({
      protocolVersion: 'session-public/1',
      messageId: 'm-o',
      outcome: 'basis-unavailable',
      body: {},
    })
    await c.ended
    const replaced = openSse(fixture.port, observe(who, session, 'obs-a', 'm-r'))
    expect(await replaced.status).toBe(200)
    await replaced.waitForEvents(1)
    a.close()
    b.close()
    replaced.close()
  })

  it('answers denied as the only SSE event without a login, and for another tenant session', async () => {
    fixture = await startFixture()
    const alice = await login(fixture, 'alice')
    const bob = await login(fixture, 'bob')
    const session = await createSession(fixture, alice)
    const noLogin = openSse(
      fixture.port,
      sessionMessage(
        'observe-session',
        { tenant: alice.tenantText, session, observationId: 'o' },
        {},
        'm-d',
      ),
    )
    expect(await noLogin.status).toBe(403)
    const events = await noLogin.waitForEvents(1)
    expect(events).toEqual([
      { protocolVersion: 'session-public/1', messageId: 'm-d', outcome: 'denied', body: {} },
    ])
    await noLogin.ended
    expect(noLogin.events().length).toBe(1)
    const foreign = openSse(
      fixture.port,
      sessionMessage(
        'observe-session',
        { tenant: alice.tenantText, session, observationId: 'o' },
        { loginProof: bob.loginProof },
        'm-f',
      ),
    )
    expect(await foreign.status).toBe(403)
    await foreign.ended
    expect(fixture.session.controls.calls().filter(c => c.method === 'history.begin')).toEqual([])
  })
})

describe('the hand-written closed read', () => {
  const TENANT =
    '{"organization":"org_abcdefghjkmnpqrstvwxyz2345","account":"acc_abcdefghjkmnpqrstvwxyz2345"}'
  const SESSION = 'a'.repeat(64)
  const good = {
    protocolVersion: 'session-public/1',
    messageId: 'm-x',
    operation: 'observe-session',
    loginProof: 'p',
    body: { tenant: TENANT, session: SESSION, observationId: 'o' },
  }

  const violations: readonly (readonly [string, Record<string, unknown>])[] = [
    ['extra root key', { ...good, extra: 1 }],
    ['actingTenant present', { ...good, actingTenant: TENANT }],
    ['messageId missing', { ...good, messageId: undefined }],
    ['messageId not a string', { ...good, messageId: 5 }],
    ['loginProof not a string', { ...good, loginProof: 1 }],
    ['body missing', { ...good, body: undefined }],
    ['body extra key', { ...good, body: { ...good.body, more: 1 } }],
    ['body key missing', { ...good, body: { tenant: TENANT, session: SESSION } }],
    [
      'tenant inner extra member',
      {
        ...good,
        body: {
          ...good.body,
          tenant:
            '{"organization":"org_abcdefghjkmnpqrstvwxyz2345","account":"acc_abcdefghjkmnpqrstvwxyz2345","x":1}',
        },
      },
    ],
    [
      'tenant inner bad text',
      {
        ...good,
        body: {
          ...good.body,
          tenant: '{"organization":"bad","account":"acc_abcdefghjkmnpqrstvwxyz2345"}',
        },
      },
    ],
    ['tenant not a string', { ...good, body: { ...good.body, tenant: {} } }],
    ['session not hex', { ...good, body: { ...good.body, session: 'A'.repeat(64) } }],
    ['session short', { ...good, body: { ...good.body, session: 'a'.repeat(63) } }],
    ['observationId empty', { ...good, body: { ...good.body, observationId: '' } }],
    ['observationId not a string', { ...good, body: { ...good.body, observationId: 1 } }],
  ]

  it('rejects each violation with protocol-rejected as an SSE for observe-session and JSON for cancel-observation', async () => {
    fixture = await startFixture()
    for (const [name, fields] of violations) {
      const stream = openSse(fixture.port, JSON.stringify(fields))
      expect(await stream.status, name).toBe(400)
      expect((await stream.headers)['content-type'], name).toBe('text/event-stream; charset=utf-8')
      const events = await stream.waitForEvents(1)
      expect(events, name).toEqual([
        {
          protocolVersion: 'session-public/1',
          ...(typeof fields.messageId === 'string' ? { messageId: fields.messageId } : {}),
          outcome: 'protocol-rejected',
          body: {},
        },
      ])
      await stream.ended
      const asCancel = await send(fixture.port, SESSION_PATH, {
        body: JSON.stringify({ ...fields, operation: 'cancel-observation' }),
      })
      expect(asCancel.status, name).toBe(400)
      expect(asCancel.headers['content-type'], name).toBe('application/json; charset=utf-8')
      expect((asCancel.json as { outcome: string }).outcome, name).toBe('protocol-rejected')
    }
    expect(fixture.session.controls.calls()).toEqual([])
  })

  it('rejects observation-frame as a request operation and a duplicate key as JSON', async () => {
    fixture = await startFixture()
    const frame = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage('observation-frame', {
        observationId: 'o',
        seq: '1',
        frame: { kind: 'ended', reason: 'denied' },
      }),
    })
    expect(frame.status).toBe(400)
    expect(frame.headers['content-type']).toBe('application/json; charset=utf-8')
    const duplicate = await send(fixture.port, SESSION_PATH, {
      body: '{"protocolVersion":"session-public/1","messageId":"m-1","operation":"observe-session","operation":"observe-session","body":{}}',
    })
    expect(duplicate.status).toBe(400)
    expect(duplicate.headers['content-type']).toBe('application/json; charset=utf-8')
  })
})

describe('stop', () => {
  it('ends every active stream with ended(unavailable)', async () => {
    fixture = await startFixture()
    const who = await login(fixture, 'alice')
    const session = await createSession(fixture, who)
    const stream = openSse(fixture.port, observe(who, session))
    await stream.waitForEvents(1)
    await fixture.stop()
    const events = await stream.waitForEvents(2)
    expect((events[1] as { body: { frame: unknown } }).body.frame).toEqual({
      kind: 'ended',
      reason: 'unavailable',
    })
    await stream.ended
    fixture = undefined
  })
})
