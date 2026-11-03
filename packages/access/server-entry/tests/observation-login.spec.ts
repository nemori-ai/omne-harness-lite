// Observations and the validity of their login (identity spec C5, D4): a revoke on this instance
// ends every observation of the revoked login at once with `ended(denied)`; an idle or maximum
// deadline that passes shows at the next round's login check and ends it the same way; an
// unjudgeable login ends it with `ended(unavailable)`. `cancel-observation` from another login of
// the same account finds nothing, ends nothing and calls no Session face.
import { afterEach, describe, expect, it } from 'vitest'
import type { IdentityGovernance } from '@omne-harness/identity'
import { parseDuration } from '@omne-harness/utc-instant'
import {
  GOVERNANCE_PATH,
  SESSION_PATH,
  anotherLogin,
  createSession,
  governed,
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

function observe(who: Login, session: string, observationId: string, messageId = 'm-o') {
  return sessionMessage(
    'observe-session',
    { tenant: who.tenantText, session, observationId },
    { loginProof: who.loginProof },
    messageId,
  )
}

function cancel(who: Login, session: string, observationId: string) {
  return sessionMessage(
    'cancel-observation',
    { tenant: who.tenantText, session, observationId },
    { loginProof: who.loginProof },
    'm-c',
  )
}

function endedFrame(observationId: string, reason: string, messageId = 'm-o') {
  return {
    protocolVersion: 'session-public/1',
    messageId,
    operation: 'observation-frame',
    body: { observationId, seq: '1', frame: { kind: 'ended', reason } },
  }
}

function duration(text: string) {
  const parsed = parseDuration(text)
  if (!parsed.ok) throw new Error(`${text} did not parse`)
  return parsed.value
}

describe('observation-ended-on-revoke', () => {
  it('ends every observation of the revoked login at once, and keeps the other login observing', async () => {
    // A long round: an end within the test can only come from the revoke itself.
    fixture = await startFixture({ config: { heartbeatIntervalMs: 60_000 } })
    const first = await login(fixture, 'alice')
    const second = await anotherLogin(fixture, first)
    const session = await createSession(fixture, first)
    const revokedA = openSse(fixture.port, observe(first, session, 'obs-a', 'm-a'))
    const revokedB = openSse(fixture.port, observe(first, session, 'obs-b', 'm-b'))
    const kept = openSse(fixture.port, observe(second, session, 'obs-a', 'm-k'))
    await Promise.all([revokedA, revokedB, kept].map(stream => stream.waitForEvents(1)))

    const revoked = await send(fixture.port, GOVERNANCE_PATH, {
      body: governed(second, 'revoke-login', { targetLoginId: first.loginId }, null),
    })
    expect(revoked.status).toBe(200)
    expect((await revokedA.waitForEvents(2))[1]).toEqual(endedFrame('obs-a', 'denied', 'm-a'))
    expect((await revokedB.waitForEvents(2))[1]).toEqual(endedFrame('obs-b', 'denied', 'm-b'))
    await Promise.all([revokedA.ended, revokedB.ended])

    // Control: the revoking login's own observation, with the same observationId, goes on.
    await sleep(30)
    expect(kept.events()).toHaveLength(1)
    const cancelled = await send(fixture.port, SESSION_PATH, {
      body: cancel(second, session, 'obs-a'),
    })
    expect((cancelled.json as { body: unknown }).body).toEqual({
      observationId: 'obs-a',
      state: 'ended',
    })
    expect((await kept.waitForEvents(2))[1]).toEqual(
      endedFrame('obs-a', 'observer-cancelled', 'm-k'),
    )
  })

  it('ends the target observations when the revoke answers no-change', async () => {
    fixture = await startFixture({
      config: { heartbeatIntervalMs: 60_000 },
      // The port answers no-change and writes nothing: the target login stays valid in identity,
      // so only the revoke branch can end its observation within the test.
      governance: (base): IdentityGovernance => ({
        ...base,
        revokeLogin: () => Promise.resolve({ kind: 'no-change' }),
      }),
    })
    const first = await login(fixture, 'alice')
    const second = await anotherLogin(fixture, first)
    const session = await createSession(fixture, first)
    const stream = openSse(fixture.port, observe(first, session, 'obs-1'))
    await stream.waitForEvents(1)
    const replay = await send(fixture.port, GOVERNANCE_PATH, {
      body: governed(second, 'revoke-login', { targetLoginId: first.loginId }, null),
    })
    expect((replay.json as { outcome: string }).outcome).toBe('no-change')
    expect((await stream.waitForEvents(2))[1]).toEqual(endedFrame('obs-1', 'denied'))
    await stream.ended
  })

  it('does not end observations when the revoke is refused', async () => {
    fixture = await startFixture({ config: { heartbeatIntervalMs: 60_000 } })
    const alice = await login(fixture, 'alice')
    const bob = await login(fixture, 'bob')
    const session = await createSession(fixture, alice)
    const stream = openSse(fixture.port, observe(alice, session, 'obs-1'))
    await stream.waitForEvents(1)
    const refused = await send(fixture.port, GOVERNANCE_PATH, {
      body: governed(bob, 'revoke-login', { targetLoginId: alice.loginId }, null),
    })
    expect(refused.status).toBe(404)
    await sleep(30)
    expect(stream.events()).toHaveLength(1)
    stream.close()
  })
})

describe('observation-ended-on-expiry', () => {
  it('ends the observation at the next round once the idle deadline passed', async () => {
    fixture = await startFixture({ config: { heartbeatIntervalMs: 30 } })
    const alice = await login(fixture, 'alice')
    const session = await createSession(fixture, alice)
    const stream = openSse(fixture.port, observe(alice, session, 'obs-1'))
    await stream.waitForEvents(1)
    // Control: rounds pass while the login is valid, and the observation stays.
    await sleep(120)
    expect(stream.events()).toHaveLength(1)
    // 601 s after the last successful business access, past the 600 s idle period.
    fixture.clock.advanceBy(duration('PT601S'))
    expect((await stream.waitForEvents(2))[1]).toEqual(endedFrame('obs-1', 'denied'))
    await stream.ended
  })

  it('ends the observation with unavailable when the login cannot be judged', async () => {
    fixture = await startFixture({ config: { heartbeatIntervalMs: 30 } })
    const alice = await login(fixture, 'alice')
    const session = await createSession(fixture, alice)
    const stream = openSse(fixture.port, observe(alice, session, 'obs-1'))
    await stream.waitForEvents(1)
    fixture.clock.makeUnavailable('clock down')
    expect((await stream.waitForEvents(2))[1]).toEqual(endedFrame('obs-1', 'unavailable'))
    await stream.ended
    fixture.clock.restore()
  })
})

describe('cancel-observation-other-login-not-found', () => {
  it('answers not-found to another login with the same observationId, ends nothing and calls no Session face', async () => {
    fixture = await startFixture({ config: { heartbeatIntervalMs: 60_000 } })
    const first = await login(fixture, 'alice')
    const second = await anotherLogin(fixture, first)
    const session = await createSession(fixture, first)
    const stream = openSse(fixture.port, observe(first, session, 'obs-1'))
    await stream.waitForEvents(1)
    const callsBefore = fixture.session.controls.calls().length

    const other = await send(fixture.port, SESSION_PATH, { body: cancel(second, session, 'obs-1') })
    expect(other.status).toBe(200)
    expect(other.json).toEqual({
      protocolVersion: 'session-public/1',
      messageId: 'm-c',
      outcome: 'succeeded',
      body: { observationId: 'obs-1', state: 'not-found' },
    })
    expect(fixture.session.controls.calls().length).toBe(callsBefore)
    await sleep(30)
    expect(stream.events()).toHaveLength(1)

    // Control: the login that established it does end it, still without a Session call.
    const own = await send(fixture.port, SESSION_PATH, { body: cancel(first, session, 'obs-1') })
    expect((own.json as { body: unknown }).body).toEqual({ observationId: 'obs-1', state: 'ended' })
    expect((await stream.waitForEvents(2))[1]).toEqual(endedFrame('obs-1', 'observer-cancelled'))
    expect(fixture.session.controls.calls().length).toBe(callsBefore)
  })
})
