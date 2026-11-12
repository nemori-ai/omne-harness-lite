// No login proof, credential or issuer leaves through a response, a diagnostic or an error text,
// apart from the one reply that issues the login. The search has a positive control.
import { connect } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import type { LoginResult } from '@omne-harness/access-cordis-contract'
import type { PrincipalIssuer } from '@omne-harness/identity'
import {
  GOVERNANCE_PATH,
  SESSION_PATH,
  createSession,
  governance,
  login,
  openSse,
  resolveDefinition,
  send,
  sessionMessage,
  startFixture,
  userMessageWire,
  type Fixture,
  type HttpReply,
} from './support/harness.ts'
import {
  PROOF,
  call,
  held,
  rawHeaders,
  startAccessFixture,
  turn,
  type AccessFixture,
  type ApiOptions,
} from './support/pipeline-kit.ts'

let fixture: Fixture | AccessFixture | undefined
afterEach(async () => {
  await fixture?.stop()
  fixture = undefined
})

describe('outputs hold no secret', () => {
  it('finds the proof and the credential only where the protocol places them', async () => {
    const issuerMarker = 'ISSUER-MARKER-7f3a'
    let issuerText = ''
    let recognitionThrows = false
    fixture = await startFixture({
      identity: base => ({
        registerAndActivate: input => base.registerAndActivate(input),
        issueLogin: input => base.issueLogin(input),
        recognizeLogin: input =>
          recognitionThrows
            ? Promise.reject(new Error(`login store exploded for ${input.loginProof}`))
            : base.recognizeLogin(input),
      }),
      issuer: (base): PrincipalIssuer => {
        const wrapped: PrincipalIssuer = {
          issueSystem: input => base.issueSystem(input),
          issueActingForTenant: input => base.issueActingForTenant(input),
        }
        issuerText = issuerMarker
        return wrapped
      },
    })
    const credential = 'CREDENTIAL-MARKER-91c2'
    const who = await login(fixture, 'alice', credential)
    const outputs: string[] = []
    const session = await createSession(fixture, who)
    const replies = await Promise.all([
      send(fixture.port, SESSION_PATH, {
        body: sessionMessage(
          'send-input',
          {
            tenant: who.tenantText,
            session,
            acceptId: 'a1',
            inputId: 'i1',
            message: userMessageWire('hello'),
          },
          { loginProof: who.loginProof },
        ),
      }),
      send(fixture.port, SESSION_PATH, {
        body: sessionMessage(
          'cancel-run',
          { tenant: who.tenantText, session, controlId: 'c1', run: 'r1', urgency: 'graceful' },
          { loginProof: who.loginProof },
        ),
      }),
      send(fixture.port, SESSION_PATH, {
        body: sessionMessage(
          'query-send-input',
          { tenant: who.tenantText, session, acceptId: 'a1' },
          { loginProof: 'forged-proof' },
        ),
      }),
      send(fixture.port, GOVERNANCE_PATH, {
        body: governance('issue-login', { loginIdentifier: 'alice', credential: 'wrong' }),
      }),
      send(fixture.port, GOVERNANCE_PATH, {
        body: governance('query-current-tenant', {}, { loginProof: who.loginProof }),
      }),
    ])
    for (const reply of replies) outputs.push(reply.text, JSON.stringify(reply.headers))
    fixture.session.controls.throwOn('accept', new Error('commit lost'))
    const fault = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'send-input',
        {
          tenant: who.tenantText,
          session,
          acceptId: 'a2',
          inputId: 'i2',
          message: userMessageWire('hello'),
        },
        { loginProof: who.loginProof },
      ),
    })
    outputs.push(fault.text)
    fixture.session.controls.restore()
    recognitionThrows = true
    const identityFault = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'query-send-input',
        { tenant: who.tenantText, session, acceptId: 'a1' },
        { loginProof: who.loginProof },
      ),
    })
    expect(identityFault.status).toBe(503)
    outputs.push(identityFault.text)
    recognitionThrows = false
    const stream = openSse(
      fixture.port,
      sessionMessage(
        'observe-session',
        { tenant: who.tenantText, session, observationId: 'o' },
        { loginProof: who.loginProof },
      ),
    )
    await stream.waitForEvents(1)
    await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'cancel-observation',
        { tenant: who.tenantText, session, observationId: 'o' },
        { loginProof: who.loginProof },
      ),
    })
    await stream.ended
    outputs.push(stream.chunks.join(''))
    outputs.push(JSON.stringify(fixture.diagnostics))
    expect(fixture.diagnostics.length).toBeGreaterThan(0)
    const haystack = outputs.join('\n')
    expect(haystack).not.toContain(who.loginProof)
    expect(haystack).not.toContain(credential)
    expect(haystack).not.toContain(issuerText)
    expect(haystack).not.toContain('identity-login')
    expect(haystack).not.toMatch(/lgn_[0-9a-z]{26}/)
    // Positive control: the search would see the proof where the protocol places it.
    const issued = await send(fixture.port, GOVERNANCE_PATH, {
      body: governance('issue-login', { loginIdentifier: 'alice', credential }),
    })
    expect(issued.text).toMatch(/"loginProof":"[^"]+"/)
    expect(JSON.stringify(fixture.diagnostics)).not.toContain(credential)
  })
})

describe('the new address keeps the proof, the tenant text and the body out of every output', () => {
  it('searches the answer of every error point of the pipeline and every diagnostic', async () => {
    const tenantText = 'TENANT-HEADER-9b2c'
    const bodyMarker = 'BODY-MARKER-5d1e'
    let mappingThrows = false
    const entry = await startAccessFixture({
      config: { maxInFlightRequests: 1 },
      dependencies: {
        resolveDefinition: name => {
          if (mappingThrows) throw new Error(`mapping exploded for ${PROOF}`)
          return resolveDefinition(name)
        },
      },
    })
    fixture = entry
    const replies: HttpReply[] = []
    const ask = async (name: string, options: ApiOptions = {}): Promise<HttpReply> => {
      const reply = await call(entry.port, name, {
        ...options,
        headers: { 'omne-acting-tenant': tenantText, ...options.headers },
      })
      replies.push(reply)
      return reply
    }
    const note = `{"noteId":"${bodyMarker}"}`
    const both = `{"noteId":"${bodyMarker}","title":"${bodyMarker}"}`

    // Steps 1 to 5.
    replies.push(
      await send(entry.port, `/api/notes/v1/read-note?token=${PROOF}`, {
        headers: { authorization: `Bearer ${PROOF}` },
        body: note,
      }),
    )
    await ask('read-note', { method: 'PUT', body: note })
    await ask('read-note', { headers: { host: 'evil.example' }, body: note })
    await ask('read-note', { headers: { 'content-type': 'text/plain' }, body: note })
    replies.push(
      await send(entry.port, '/api/other/v1/read-note', {
        headers: { authorization: `Bearer ${PROOF}`, 'omne-acting-tenant': tenantText },
        body: note,
      }),
    )
    await ask('watch-note', { body: note })
    // Steps 7 to 9.
    await ask('read-note', { headers: { 'omne-message-id': undefined }, body: note })
    await ask('save-note', { headers: { authorization: `Bearer ${PROOF}-revoked` }, body: both })
    entry.accessIdentity.identifyLogin = {
      kind: 'answer',
      value: { outcome: 'basis-unavailable' },
    }
    await ask('read-note', { body: note })
    entry.accessIdentity.identifyLogin = { kind: 'throw' }
    await ask('read-note', { body: note })
    delete entry.accessIdentity.identifyLogin
    entry.accessIdentity.actFor = { kind: 'reject' }
    await ask('save-note', { body: both })
    delete entry.accessIdentity.actFor
    await ask('read-note', { body: `{"noteId":"${bodyMarker}${'x'.repeat(3000)}"}` })
    await ask('read-note', { body: `{"noteId":"${bodyMarker}","extra":"${bodyMarker}"}` })
    // Step 14: the report fails with the proof in its error text.
    entry.accessIdentity.reportAccess = { kind: 'reject' }
    await ask('save-note', { body: both })
    await entry.accessIdentity.returned('reportAccess')
    // Step 6: the budget is full while a handler holds the only slot.
    const answer = held<{ outcome: 'succeeded'; body: { noteId: string; title: string } }>()
    entry.notes.scripts['read-note'] = () => answer.promise
    const holding = ask('read-note', { body: note })
    await entry.notes.called()
    await ask('read-note', { body: note })
    answer.resolve({ outcome: 'succeeded', body: { noteId: 'n', title: 't' } })
    await holding
    delete entry.notes.scripts['read-note']
    // The caller goes away while the identity port has not returned.
    const identified = entry.accessIdentity.calls.filter(
      line => line.method === 'identifyLogin',
    ).length
    const recognised = held<LoginResult>()
    entry.accessIdentity.identifyLogin = { kind: 'hold', held: recognised }
    const socket = connect({ host: '127.0.0.1', port: entry.port }, () => {
      socket.write(
        ['POST /api/notes/v1/read-note HTTP/1.1', ...rawHeaders(note.length), '', note].join(
          '\r\n',
        ),
      )
    })
    socket.on('error', () => {})
    await entry.accessIdentity.called('identifyLogin', identified + 1)
    socket.destroy()
    while (!entry.diagnostics.some(event => event.code === 'access.caller-gone')) await turn()
    recognised.resolve({ outcome: 'denied' })
    // A take-down while the identity port has not returned.
    entry.accessIdentity.identifyLogin = { kind: 'hold', held: held<LoginResult>() }
    const aborted = ask('read-note', { body: note })
    await entry.accessIdentity.called('identifyLogin', identified + 2)
    await entry.takeDown()
    await aborted
    // The one fault of the existing locations that recorded the whole request target.
    const who = await login(entry, 'secrets-user')
    mappingThrows = true
    const fault = await send(entry.port, `${SESSION_PATH}?`, {
      body: sessionMessage(
        'create-session',
        { createCallId: 'create-1', definition: 'assistant', purpose: 'test' },
        { loginProof: who.loginProof, actingTenant: who.tenantText },
      ),
    })
    expect(fault.status).toBe(500)

    const texts = replies.map(
      reply => `${reply.status} ${JSON.stringify(reply.headers)} ${reply.text}`,
    )
    const haystack = [...texts, JSON.stringify(entry.diagnostics)].join('\n')
    expect(haystack).not.toContain(PROOF)
    expect(haystack).not.toContain(tenantText)
    expect(haystack).not.toContain(bodyMarker)
    expect(haystack).not.toContain(who.loginProof)

    const pipelineEvents = entry.diagnostics.filter(event => event.code.startsWith('access.'))
    expect(new Set(pipelineEvents.map(event => event.code))).toEqual(
      new Set([
        'access.path-rejected',
        'access.method-rejected',
        'access.host-rejected',
        'access.content-type-rejected',
        'access.not-mounted',
        'access.observation-not-served',
        'access.message-id-rejected',
        'access.identity-denied',
        'access.identity-unavailable',
        'access.identity-fault',
        'access.body-over-limit',
        'access.body-rejected',
        'access.report-fault',
        'access.busy',
        'access.caller-gone',
        'access.aborted',
      ]),
    )
    const allowed = new Set(['code', 'path', 'protocol', 'major', 'operation'])
    for (const event of pipelineEvents)
      expect(Object.keys(event).filter(key => !allowed.has(key))).toEqual([])
    for (const event of entry.diagnostics) expect(event.path ?? '').not.toContain('?')
    expect(entry.diagnostics).toContainEqual({ code: 'request.fault', path: SESSION_PATH })
  })
})
