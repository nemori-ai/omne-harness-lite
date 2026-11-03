// The report of a successful business access (identity spec C4, P-7): only a session operation
// that answers `succeeded`, and an established `observe-session`, report the caller's login; a
// failure, a governance operation and `cancel-observation` do not. A failed report changes no answer.
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
  startFixture,
  userMessageWire,
  type Fixture,
  type HttpReply,
  type Login,
} from './support/harness.ts'

let fixture: Fixture | undefined
afterEach(async () => {
  await fixture?.stop()
  fixture = undefined
})

type Reports = Readonly<{
  logins: string[]
  wrap: (base: IdentityGovernance) => IdentityGovernance
}>

type ReportMode = 'pass' | 'reject' | 'unavailable' | 'never'

function countingReports(mode: ReportMode = 'pass'): Reports {
  const logins: string[] = []
  return {
    logins,
    wrap: base => ({
      ...base,
      reportBusinessAccess: input => {
        logins.push(input.login.text)
        switch (mode) {
          case 'pass':
            return base.reportBusinessAccess(input)
          case 'reject':
            return Promise.reject(new Error('report lost'))
          case 'unavailable':
            return Promise.resolve({ kind: 'basis-unavailable', diagnostic: 'clock down' })
          case 'never':
            return new Promise(() => {})
        }
      },
    }),
  }
}

/** Resolves to `settled` when `promise` settles within `ms`, else to `pending`. */
function within(promise: Promise<unknown>, ms: number): Promise<'settled' | 'pending'> {
  return Promise.race([
    promise.then(() => 'settled' as const),
    new Promise<'pending'>(resolve => setTimeout(() => resolve('pending'), ms)),
  ])
}

function sendInput(who: Login, session: string, acceptId: string, tenant = who.tenantText) {
  return sessionMessage(
    'send-input',
    { tenant, session, acceptId, inputId: `i-${acceptId}`, message: userMessageWire('hello') },
    { loginProof: who.loginProof },
  )
}

function outcomeOf(reply: HttpReply): string {
  return (reply.json as { outcome: string }).outcome
}

function duration(text: string) {
  const parsed = parseDuration(text)
  if (!parsed.ok) throw new Error(`${text} did not parse`)
  return parsed.value
}

describe('the business access report', () => {
  it('reports a succeeded session operation and an established observation, and nothing else', async () => {
    const reports = countingReports()
    fixture = await startFixture({ governance: reports.wrap })
    const alice = await login(fixture, 'alice')
    const bob = await login(fixture, 'bob')
    const session = await createSession(fixture, alice)
    expect(reports.logins).toEqual([alice.loginId])

    const accepted = await send(fixture.port, SESSION_PATH, {
      body: sendInput(alice, session, 'a-1'),
    })
    expect(outcomeOf(accepted)).toBe('succeeded')
    const history = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'read-history',
        {
          tenant: alice.tenantText,
          session,
          cursor: null,
          direction: 'forward',
          pageBytes: '4096',
        },
        { loginProof: alice.loginProof },
      ),
    })
    expect(outcomeOf(history)).toBe('succeeded')
    expect(reports.logins).toEqual([alice.loginId, alice.loginId, alice.loginId])

    // Failures report nothing: a denied target, a forged proof, a commit fault.
    const denied = await send(fixture.port, SESSION_PATH, {
      body: sendInput(bob, session, 'a-2', alice.tenantText),
    })
    expect(outcomeOf(denied)).toBe('denied')
    const forged = await send(fixture.port, SESSION_PATH, {
      body: sendInput({ ...alice, loginProof: 'forged' }, session, 'a-3'),
    })
    expect(outcomeOf(forged)).toBe('denied')
    fixture.session.controls.throwOn('accept', new Error('commit lost'))
    const unknown = await send(fixture.port, SESSION_PATH, {
      body: sendInput(alice, session, 'a-4'),
    })
    expect(outcomeOf(unknown)).toBe('unknown')
    fixture.session.controls.restore()
    // Governance operations report nothing, even when they succeed.
    const current = await send(fixture.port, GOVERNANCE_PATH, {
      body: governed(alice, 'query-current-tenant', {}, null),
    })
    expect(outcomeOf(current)).toBe('succeeded')
    expect(reports.logins).toHaveLength(3)

    // An established observation reports; a cancel does not.
    const stream = openSse(
      fixture.port,
      sessionMessage(
        'observe-session',
        { tenant: alice.tenantText, session, observationId: 'o-1' },
        { loginProof: alice.loginProof },
      ),
    )
    await stream.waitForEvents(1)
    expect(reports.logins).toHaveLength(4)
    const refusedObserve = openSse(
      fixture.port,
      sessionMessage(
        'observe-session',
        { tenant: alice.tenantText, session, observationId: 'o-2' },
        { loginProof: bob.loginProof },
      ),
    )
    await refusedObserve.waitForEvents(1)
    await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'cancel-observation',
        { tenant: alice.tenantText, session, observationId: 'o-1' },
        { loginProof: alice.loginProof },
      ),
    })
    await stream.ended
    expect(reports.logins).toHaveLength(4)
  })

  it('keeps the answer when the report is rejected', async () => {
    const reports = countingReports('reject')
    fixture = await startFixture({ governance: reports.wrap })
    const alice = await login(fixture, 'alice')
    const session = await createSession(fixture, alice)
    const accepted = await send(fixture.port, SESSION_PATH, {
      body: sendInput(alice, session, 'a-1'),
    })
    expect(accepted.status).toBe(200)
    expect(outcomeOf(accepted)).toBe('succeeded')
    expect(reports.logins).toHaveLength(2)
    expect(fixture.diagnostics).toContainEqual({
      code: 'identity.fault',
      operation: 'reportBusinessAccess',
    })
  })

  it('keeps the answer and leaves a diagnostic when the report answers basis-unavailable', async () => {
    const reports = countingReports('unavailable')
    fixture = await startFixture({ governance: reports.wrap })
    const alice = await login(fixture, 'alice')
    const session = await createSession(fixture, alice)
    const before = fixture.diagnostics.length
    const accepted = await send(fixture.port, SESSION_PATH, {
      body: sendInput(alice, session, 'a-1'),
    })
    expect(accepted.status).toBe(200)
    expect(outcomeOf(accepted)).toBe('succeeded')
    expect(reports.logins).toHaveLength(2)
    expect(fixture.diagnostics.slice(before)).toEqual([
      { code: 'identity.fault', operation: 'reportBusinessAccess' },
    ])
  })

  it('writes the answer, frees the slot and stops when the report never settles', async () => {
    const reports = countingReports('never')
    const current = await startFixture({
      governance: reports.wrap,
      config: { observation: { perLogin: 1, perInstance: 8, cancelRetentionMs: 200 } },
    })
    fixture = current
    const alice = await login(current, 'alice')
    const session = await within(createSession(current, alice), 2000)
    expect(session).toBe('settled')
    const created = await createSession(current, alice, 'create-2')
    const accepted = await within(
      send(current.port, SESSION_PATH, { body: sendInput(alice, created, 'a-1') }),
      2000,
    )
    expect(accepted).toBe('settled')
    const observe = (observationId: string) =>
      openSse(
        current.port,
        sessionMessage(
          'observe-session',
          { tenant: alice.tenantText, session: created, observationId },
          { loginProof: alice.loginProof },
        ),
      )
    const first = observe('o-1')
    expect((await first.waitForEvents(1))[0]).toMatchObject({ outcome: 'succeeded' })
    // The connection close frees the only slot of this login, though its report never settled.
    first.close()
    await first.ended
    const deadline = Date.now() + 2000
    let second = observe('o-2')
    let [confirmation] = await second.waitForEvents(1)
    while ((confirmation as { outcome: string }).outcome !== 'succeeded' && Date.now() < deadline) {
      second = observe('o-2')
      ;[confirmation] = await second.waitForEvents(1)
    }
    expect(confirmation).toMatchObject({ outcome: 'succeeded' })
    expect(reports.logins.length).toBeGreaterThanOrEqual(4)
    expect(await within(current.stop(), 2000)).toBe('settled')
    fixture = undefined
  })

  it('refreshes only the reporting login: it outlives the idle period, the other login does not', async () => {
    fixture = await startFixture()
    const alice = await login(fixture, 'alice')
    const idleOnly = await anotherLogin(fixture, alice)
    const session = await createSession(fixture, alice)
    fixture.clock.advanceBy(duration('PT500S'))
    const accepted = await send(fixture.port, SESSION_PATH, {
      body: sendInput(alice, session, 'a-1'),
    })
    expect(outcomeOf(accepted)).toBe('succeeded')
    // 700 s after issue: past the 600 s idle period of the first issue.
    fixture.clock.advanceBy(duration('PT200S'))
    const refreshed = await send(fixture.port, GOVERNANCE_PATH, {
      body: governed(alice, 'query-current-tenant', {}, null),
    })
    expect(outcomeOf(refreshed)).toBe('succeeded')
    const expired = await send(fixture.port, GOVERNANCE_PATH, {
      body: governed(idleOnly, 'query-current-tenant', {}, null),
    })
    expect(outcomeOf(expired)).toBe('denied')
  })
})
