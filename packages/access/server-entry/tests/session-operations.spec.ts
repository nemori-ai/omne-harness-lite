// The session location: the seven operations against the Session double, the judgment order one
// step at a time, denied byte-for-byte, and the two classes of dependency faults.
import { afterEach, describe, expect, it } from 'vitest'
import { loginStateCodec } from '@omne-harness/legal-identity'
import { INGRESS_FAMILIES, deriveIngressOperation } from '@omne-harness/session-contract'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import {
  DEFINITION,
  SESSION_PATH,
  createSession,
  login,
  send,
  sessionMessage,
  sessionTextOf,
  sha256Hex,
  startFixture,
  userMessageWire,
  type Fixture,
  type Login,
} from './support/harness.ts'

let fixture: Fixture | undefined
afterEach(async () => {
  await fixture?.stop()
  fixture = undefined
})

async function loginText(who: Login): Promise<string> {
  const recognized = await fixture!.identity.recognizeLogin({ loginProof: who.loginProof })
  if (recognized.kind !== 'recognized') throw new Error('fixture login not recognized')
  const encoded = loginStateCodec.encode(recognized.login)
  if (!encoded.ok) throw new Error('login text did not encode')
  return encoded.value
}

function outcomeOf(json: unknown): string {
  return (json as { outcome: string }).outcome
}

describe('create-session and query-create-session', () => {
  it('derives the session and the create operation, builds the creation from the mapping and signs the principal', async () => {
    fixture = await startFixture()
    const who = await login(fixture, 'alice')
    const reply = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'create-session',
        { createCallId: 'create-1', definition: DEFINITION, purpose: 'hello' },
        { loginProof: who.loginProof, actingTenant: who.tenantText },
        'm-11',
      ),
    })
    expect(reply.status).toBe(200)
    const expectedSession = sessionTextOf(who.tenantText, 'create-1')
    expect(reply.json).toEqual({
      protocolVersion: 'session-public/1',
      messageId: 'm-11',
      outcome: 'succeeded',
      body: { session: expectedSession, recovered: false },
    })
    const [call] = fixture.session.controls.calls()
    expect(call?.method).toBe('create')
    expect(call?.session).toBe(expectedSession)
    expect(call?.operation).toBe(
      deriveIngressOperation(INGRESS_FAMILIES.create, [who.tenantText, 'create-1']),
    )
    expect(call?.input).toMatchObject({
      definition: { name: DEFINITION, candidate: { name: 'assistant@1' } },
      execution: { name: 'execution' },
      entryContract: { name: 'entry' },
      purpose: 'hello',
      workspace: null,
      workspaceAttachment: null,
      initial: null,
      modes: { kind: 'tenant-default', source: { name: 'defaults' } },
    })
    const principal = call?.principal as ActingForTenantPrincipal
    expect(principal.kind).toBe('acting-for-tenant')
    expect(principal.actor.kind).toBe('system')
    expect(principal.tenant.account.text).toBe(who.accountText)
    expect(principal.work).toEqual({ owner: 'identity-login', work: await loginText(who) })
    const verified = await (
      await import('@omne-harness/identity')
    )
      .inProcessPrincipalAuthority()
      .verifier.verify(principal)
    expect(verified.kind).toBe('rejected')
  })

  it('answers recovered true to the same createCallId and conflict to another creation', async () => {
    fixture = await startFixture()
    const who = await login(fixture, 'alice')
    await createSession(fixture, who, 'create-1')
    const again = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'create-session',
        { createCallId: 'create-1', definition: DEFINITION, purpose: 'test' },
        { loginProof: who.loginProof, actingTenant: who.tenantText },
      ),
    })
    expect(again.status).toBe(200)
    expect((again.json as { body: { recovered: boolean } }).body.recovered).toBe(true)
    const other = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'create-session',
        { createCallId: 'create-1', definition: DEFINITION, purpose: 'different' },
        { loginProof: who.loginProof, actingTenant: who.tenantText },
      ),
    })
    expect(other.status).toBe(409)
    expect(outcomeOf(other.json)).toBe('conflict')
  })

  it('answers invalid to a definition outside the mapping without calling Session', async () => {
    fixture = await startFixture()
    const who = await login(fixture, 'alice')
    const reply = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'create-session',
        { createCallId: 'create-1', definition: 'unknown', purpose: 'p' },
        { loginProof: who.loginProof, actingTenant: who.tenantText },
      ),
    })
    expect(reply.status).toBe(422)
    expect(outcomeOf(reply.json)).toBe('invalid')
    expect(fixture.session.controls.calls()).toEqual([])
  })

  it('answers denied when the acting tenant is not the login current selection', async () => {
    fixture = await startFixture()
    const alice = await login(fixture, 'alice')
    const bob = await login(fixture, 'bob')
    const reply = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'create-session',
        { createCallId: 'create-1', definition: DEFINITION, purpose: 'p' },
        { loginProof: alice.loginProof, actingTenant: bob.tenantText },
      ),
    })
    expect(reply.status).toBe(403)
    expect(reply.json).toEqual({
      protocolVersion: 'session-public/1',
      messageId: 'm-1',
      outcome: 'denied',
      body: {},
    })
    expect(fixture.session.controls.calls()).toEqual([])
  })

  it('recalls a creation with query-create-session and answers denied before it exists', async () => {
    fixture = await startFixture()
    const who = await login(fixture, 'alice')
    const before = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'query-create-session',
        { tenant: who.tenantText, createCallId: 'create-1' },
        { loginProof: who.loginProof },
      ),
    })
    expect(before.status).toBe(403)
    expect(outcomeOf(before.json)).toBe('denied')
    const session = await createSession(fixture, who, 'create-1')
    const after = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'query-create-session',
        { tenant: who.tenantText, createCallId: 'create-1' },
        { loginProof: who.loginProof },
      ),
    })
    expect(after.status).toBe(200)
    expect((after.json as { body: { session: string } }).body).toEqual({ session })
  })

  it('maps a not-committed creation to denied, never to not-found', async () => {
    fixture = await startFixture()
    const who = await login(fixture, 'alice')
    fixture.session.controls.checkExistenceOnQuery(false)
    const reply = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'query-create-session',
        { tenant: who.tenantText, createCallId: 'never-created' },
        { loginProof: who.loginProof },
      ),
    })
    expect(reply.status).toBe(403)
    expect(outcomeOf(reply.json)).toBe('denied')
    expect(fixture.session.controls.calls().map(c => c.method)).toEqual(['queryOperation'])
  })
})

describe('send-input and query-send-input', () => {
  it('derives the accept operation, the input identity and the login-entry origin, and decodes the message', async () => {
    fixture = await startFixture()
    const who = await login(fixture, 'alice')
    const session = await createSession(fixture, who)
    const reply = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'send-input',
        {
          tenant: who.tenantText,
          session,
          acceptId: 'accept-1',
          inputId: 'input-1',
          message: userMessageWire('hi'),
        },
        { loginProof: who.loginProof },
      ),
    })
    expect(reply.status).toBe(200)
    expect((reply.json as { body: unknown }).body).toEqual({ recovered: false })
    const accept = fixture.session.controls.calls().find(call => call.method === 'accept')
    expect(accept?.operation).toBe(
      deriveIngressOperation(INGRESS_FAMILIES.accept, [who.tenantText, session, 'accept-1']),
    )
    const text = await loginText(who)
    expect(accept?.input).toMatchObject({
      kind: 'ordinary',
      input: sha256Hex(['session-public/1:input', who.tenantText, session, 'input-1']),
      message: { role: 'user', id: 'msg_abcdefghijklmnopqrstuv' },
      origin: {
        owner: 'login-entry',
        record: text,
        revision: '1',
        digest: sha256Hex(['login-entry', who.accountText, text]),
      },
    })
    const query = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'query-send-input',
        { tenant: who.tenantText, session, acceptId: 'accept-1' },
        { loginProof: who.loginProof },
      ),
    })
    expect(query.status).toBe(200)
    expect((query.json as { body: unknown }).body).toEqual({})
    const unknown = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'query-send-input',
        { tenant: who.tenantText, session, acceptId: 'accept-9' },
        { loginProof: who.loginProof },
      ),
    })
    expect(unknown.status).toBe(200)
    expect(outcomeOf(unknown.json)).toBe('not-committed')
  })

  it('rejects a message that the message package does not admit, without calling Session', async () => {
    fixture = await startFixture()
    const who = await login(fixture, 'alice')
    const session = await createSession(fixture, who)
    const calls = fixture.session.controls.calls().length
    const reply = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'send-input',
        {
          tenant: who.tenantText,
          session,
          acceptId: 'accept-1',
          inputId: 'input-1',
          message: { id: 'msg_abcdefghijklmnopqrstuv', role: 'user', blocks: [] },
        },
        { loginProof: who.loginProof },
        'm-5',
      ),
    })
    expect(reply.status).toBe(400)
    expect(reply.json).toEqual({
      protocolVersion: 'session-public/1',
      messageId: 'm-5',
      outcome: 'protocol-rejected',
      body: {},
    })
    expect(fixture.session.controls.calls().length).toBe(calls)
  })

  it('rejects a body that names a login or an operation', async () => {
    fixture = await startFixture()
    const who = await login(fixture, 'alice')
    const session = await createSession(fixture, who)
    const reply = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'cancel-run',
        {
          tenant: who.tenantText,
          session,
          controlId: 'c1',
          run: 'r1',
          urgency: 'graceful',
          login: 'x',
        },
        { loginProof: who.loginProof },
      ),
    })
    expect(reply.status).toBe(400)
    expect(outcomeOf(reply.json)).toBe('protocol-rejected')
  })
})

describe('read-history', () => {
  it('reads the first page with begin and the next page with next, in the public page shape', async () => {
    fixture = await startFixture({ config: { maxPageBytes: 4096 } })
    const who = await login(fixture, 'alice')
    const session = await createSession(fixture, who)
    for (let i = 1; i <= 3; i++)
      fixture.session.controls.addEntry(session as never, {
        id: `e${i}`,
        kind: i % 2 === 1 ? 'message.user' : 'message.assistant',
        payload: `p${i}`,
      })
    const first = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'read-history',
        { tenant: who.tenantText, session, cursor: null, direction: 'forward', pageBytes: '128' },
        { loginProof: who.loginProof },
      ),
    })
    expect(first.status).toBe(200)
    const page = (
      first.json as {
        body: {
          entries: unknown[]
          next: string | null
          exhausted: boolean
          scannedThrough: string
        }
      }
    ).body
    expect(Object.keys(page).sort()).toEqual(['entries', 'exhausted', 'next', 'scannedThrough'])
    expect(page.entries).toEqual([
      { entryId: 'e1', revision: '1', kind: 'message.user', payload: 'p1' },
      { entryId: 'e2', revision: '1', kind: 'message.assistant', payload: 'p2' },
    ])
    expect(page.exhausted).toBe(false)
    expect(page.next).toBe('cursor:2')
    const begin = fixture.session.controls.calls().find(call => call.method === 'history.begin')
    expect(begin?.input).toEqual({ kinds: ['message.user', 'message.assistant'], pageBytes: 128 })
    const second = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'read-history',
        { tenant: who.tenantText, session, cursor: page.next },
        { loginProof: who.loginProof },
      ),
    })
    expect(second.status).toBe(200)
    expect((second.json as { body: { exhausted: boolean } }).body.exhausted).toBe(true)
    const foreign = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'read-history',
        { tenant: who.tenantText, session, cursor: 'forged' },
        { loginProof: who.loginProof },
      ),
    })
    expect(foreign.status).toBe(422)
    expect(outcomeOf(foreign.json)).toBe('invalid')
  })

  it('answers invalid to pageBytes over the deployment bound without calling Session', async () => {
    fixture = await startFixture({ config: { maxPageBytes: 1000 } })
    const who = await login(fixture, 'alice')
    const session = await createSession(fixture, who)
    const calls = fixture.session.controls.calls().length
    for (const pageBytes of ['1001', '99999999999999999999999999']) {
      const reply = await send(fixture.port, SESSION_PATH, {
        body: sessionMessage(
          'read-history',
          { tenant: who.tenantText, session, cursor: null, direction: 'backward', pageBytes },
          { loginProof: who.loginProof },
        ),
      })
      expect(reply.status, pageBytes).toBe(422)
      expect(outcomeOf(reply.json)).toBe('invalid')
    }
    expect(fixture.session.controls.calls().length).toBe(calls)
  })
})

describe('cancel-run and stop-call', () => {
  it('reaches cancelRun with the control operation derived from the login and answers the saved answer', async () => {
    fixture = await startFixture()
    const who = await login(fixture, 'alice')
    const session = await createSession(fixture, who)
    fixture.session.controls.addRun(session as never, 'run-1')
    const reply = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'cancel-run',
        { tenant: who.tenantText, session, controlId: 'ctl-1', run: 'run-1', urgency: 'graceful' },
        { loginProof: who.loginProof },
      ),
    })
    expect(reply.status).toBe(200)
    expect((reply.json as { body: unknown }).body).toEqual({
      kind: 'requested',
      controlId: 'ctl-1',
      run: 'run-1',
    })
    const call = fixture.session.controls.calls().find(c => c.method === 'cancelRun')
    expect(call?.operation).toBe(
      deriveIngressOperation(INGRESS_FAMILIES.control, [
        await loginText(who),
        who.tenantText,
        session,
        'ctl-1',
      ]),
    )
    expect(call?.input).toEqual({ run: 'run-1', urgency: 'graceful' })
    const missing = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'cancel-run',
        { tenant: who.tenantText, session, controlId: 'ctl-2', run: 'run-9', urgency: 'force' },
        { loginProof: who.loginProof },
      ),
    })
    expect(missing.status).toBe(404)
    expect(missing.json).toEqual({
      protocolVersion: 'session-public/1',
      messageId: 'm-1',
      outcome: 'not-found',
      body: {},
    })
  })

  it('shares the controlId range between cancel-run and stop-call and answers conflict on reuse', async () => {
    fixture = await startFixture()
    const who = await login(fixture, 'alice')
    const session = await createSession(fixture, who)
    fixture.session.controls.addRun(session as never, 'run-1')
    await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'cancel-run',
        { tenant: who.tenantText, session, controlId: 'ctl-1', run: 'run-1', urgency: 'graceful' },
        { loginProof: who.loginProof },
      ),
    })
    const reused = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'stop-call',
        {
          tenant: who.tenantText,
          session,
          controlId: 'ctl-1',
          producer: { kind: 'model', call: 'call-1' },
        },
        { loginProof: who.loginProof },
      ),
    })
    expect(reused.status).toBe(409)
    expect(outcomeOf(reused.json)).toBe('conflict')
  })

  it('answers unsupported to a Tool target after the access judgment, whether or not the session exists, writing nothing', async () => {
    fixture = await startFixture()
    const who = await login(fixture, 'alice')
    const session = await createSession(fixture, who)
    const committed = fixture.session.controls.committed().size
    const stop = (target: string, messageId: string) =>
      send(fixture!.port, SESSION_PATH, {
        body: sessionMessage(
          'stop-call',
          {
            tenant: who.tenantText,
            session: target,
            controlId: 'ctl-7',
            producer: { kind: 'tool', call: 'call-1' },
          },
          { loginProof: who.loginProof },
          messageId,
        ),
      })
    const existing = await stop(session, 'm-1')
    const absent = await stop('0'.repeat(64), 'm-1')
    expect(existing.status).toBe(501)
    expect(existing.json).toEqual({
      protocolVersion: 'session-public/1',
      messageId: 'm-1',
      outcome: 'unsupported',
      body: {},
    })
    expect(absent.text).toBe(existing.text)
    expect(fixture.session.controls.committed().size).toBe(committed)
    fixture.members.clear()
    const denied = await stop(session, 'm-1')
    expect(denied.status).toBe(403)
    expect(outcomeOf(denied.json)).toBe('denied')
  })

  it('answers unsupported to a Tool target even when Session would answer a business result', async () => {
    fixture = await startFixture()
    const who = await login(fixture, 'alice')
    const session = await createSession(fixture, who)
    fixture.session.controls.refuseToolTargets(false)
    const reply = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'stop-call',
        {
          tenant: who.tenantText,
          session,
          controlId: 'ctl-8',
          producer: { kind: 'tool', call: 'call-1' },
        },
        { loginProof: who.loginProof },
      ),
    })
    expect(reply.status).toBe(501)
    expect(outcomeOf(reply.json)).toBe('unsupported')
    const call = fixture.session.controls.calls().find(c => c.method === 'stopCall')
    expect(call?.input).toEqual({ producer: { kind: 'tool', call: 'call-1' } })
  })
})

describe('denied discloses nothing', () => {
  it('answers the same bytes to another tenant session, an unknown session and no eligibility', async () => {
    fixture = await startFixture()
    const alice = await login(fixture, 'alice')
    const bob = await login(fixture, 'bob')
    const aliceSession = await createSession(fixture, alice)
    const query = (who: Login, tenant: string, session: string) =>
      send(fixture!.port, SESSION_PATH, {
        body: sessionMessage(
          'query-send-input',
          { tenant, session, acceptId: 'a1' },
          { loginProof: who.loginProof },
          'm-same',
        ),
      })
    const otherTenant = await query(bob, alice.tenantText, aliceSession)
    const unknownSession = await query(alice, alice.tenantText, 'f'.repeat(64))
    fixture.members.get(`${alice.tenant.organization.text}/${alice.accountText}`)?.clear()
    const noEligibility = await query(alice, alice.tenantText, aliceSession)
    const missingProof = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'query-send-input',
        { tenant: alice.tenantText, session: aliceSession, acceptId: 'a1' },
        {},
        'm-same',
      ),
    })
    const emptyProof = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'query-send-input',
        { tenant: alice.tenantText, session: aliceSession, acceptId: 'a1' },
        { loginProof: '' },
        'm-same',
      ),
    })
    const foreignProof = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'query-send-input',
        { tenant: alice.tenantText, session: aliceSession, acceptId: 'a1' },
        { loginProof: 'forged' },
        'm-same',
      ),
    })
    for (const reply of [
      otherTenant,
      unknownSession,
      noEligibility,
      missingProof,
      emptyProof,
      foreignProof,
    ]) {
      expect(reply.status).toBe(403)
      expect(reply.text).toBe(otherTenant.text)
      expect(reply.headers['content-type']).toBe(otherTenant.headers['content-type'])
      expect(reply.headers['content-length']).toBe(otherTenant.headers['content-length'])
      expect(reply.headers['cache-control']).toBe(otherTenant.headers['cache-control'])
      expect(Object.keys(reply.headers).sort()).toEqual(Object.keys(otherTenant.headers).sort())
    }
    expect(otherTenant.json).toEqual({
      protocolVersion: 'session-public/1',
      messageId: 'm-same',
      outcome: 'denied',
      body: {},
    })
  })
})

describe('dependency faults', () => {
  it('answers unknown with a body when a Session commit throws after the call began', async () => {
    fixture = await startFixture()
    const who = await login(fixture, 'alice')
    const session = await createSession(fixture, who)
    fixture.session.controls.throwOn('accept', new Error('commit lost'))
    const reply = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'send-input',
        {
          tenant: who.tenantText,
          session,
          acceptId: 'a1',
          inputId: 'i1',
          message: userMessageWire('x'),
        },
        { loginProof: who.loginProof },
        'm-u',
      ),
    })
    expect(reply.status).toBe(500)
    expect(reply.json).toEqual({
      protocolVersion: 'session-public/1',
      messageId: 'm-u',
      outcome: 'unknown',
      body: {},
    })
    fixture.session.controls.restore()
    fixture.session.controls.throwOn('cancelRun', new Error('commit lost'))
    const cancel = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'cancel-run',
        { tenant: who.tenantText, session, controlId: 'c1', run: 'r1', urgency: 'graceful' },
        { loginProof: who.loginProof },
      ),
    })
    expect(cancel.status).toBe(500)
    expect(outcomeOf(cancel.json)).toBe('unknown')
  })

  it('answers basis-unavailable when a read-class dependency throws', async () => {
    fixture = await startFixture()
    const who = await login(fixture, 'alice')
    const session = await createSession(fixture, who)
    fixture.session.controls.throwOn('queryOperation', new Error('read lost'))
    const query = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'query-send-input',
        { tenant: who.tenantText, session, acceptId: 'a1' },
        { loginProof: who.loginProof },
      ),
    })
    expect(query.status).toBe(503)
    expect(outcomeOf(query.json)).toBe('basis-unavailable')
    fixture.session.controls.restore()
    fixture.session.controls.throwOn('history.begin', new Error('read lost'))
    const history = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'read-history',
        { tenant: who.tenantText, session, cursor: null, direction: 'forward', pageBytes: '10' },
        { loginProof: who.loginProof },
      ),
    })
    expect(history.status).toBe(503)
    expect(outcomeOf(history.json)).toBe('basis-unavailable')
  })

  it('answers basis-unavailable with status 503, not 500, when identity recognition throws', async () => {
    fixture = await startFixture({
      identity: base => ({
        registerAndActivate: input => base.registerAndActivate(input),
        issueLogin: input => base.issueLogin(input),
        recognizeLogin: () => Promise.reject(new Error('login store exploded')),
      }),
    })
    const who = await login(fixture, 'alice')
    const reply = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'create-session',
        { createCallId: 'c1', definition: DEFINITION, purpose: 'p' },
        { loginProof: who.loginProof, actingTenant: who.tenantText },
      ),
    })
    expect(reply.status).toBe(503)
    expect(outcomeOf(reply.json)).toBe('basis-unavailable')
    expect(fixture.session.controls.calls()).toEqual([])
  })

  it('answers basis-unavailable when the issuer fails or throws', async () => {
    fixture = await startFixture({
      issuer: base => ({
        issueSystem: input => base.issueSystem(input),
        issueActingForTenant: () => {
          throw new Error('issuer exploded')
        },
      }),
    })
    const who = await login(fixture, 'alice')
    const reply = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'create-session',
        { createCallId: 'c1', definition: DEFINITION, purpose: 'p' },
        { loginProof: who.loginProof, actingTenant: who.tenantText },
      ),
    })
    expect(reply.status).toBe(503)
    expect(outcomeOf(reply.json)).toBe('basis-unavailable')
    expect(fixture.session.controls.calls()).toEqual([])
  })
})
