// No login proof, credential or issuer leaves through a response, a diagnostic or an error text,
// apart from the one reply that issues the login. The search has a positive control.
import { afterEach, describe, expect, it } from 'vitest'
import type { PrincipalIssuer } from '@omne-harness/identity'
import {
  GOVERNANCE_PATH,
  SESSION_PATH,
  createSession,
  governance,
  login,
  openSse,
  send,
  sessionMessage,
  startFixture,
  userMessageWire,
  type Fixture,
} from './support/harness.ts'

let fixture: Fixture | undefined
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
