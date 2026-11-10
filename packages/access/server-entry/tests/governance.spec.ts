// The governance location: register and activate, issue a login, the four stage operations, the
// fourteen operations this deployment declares not provided, protocol rejections, and an identity
// fault. The eighteen governed operations are in governance-operations.spec.ts and the four setting
// operations in settings.spec.ts.
import { afterEach, describe, expect, it } from 'vitest'
import type { IdentityOperations } from '@omne-harness/identity'
import { NOT_PROVIDED_GOVERNANCE_OPERATIONS, SETTING_OPERATIONS } from '../src/governance.ts'
import { GOVERNANCE_PATH, governance, send, startFixture, type Fixture } from './support/harness.ts'

let fixture: Fixture | undefined
afterEach(async () => {
  await fixture?.stop()
  fixture = undefined
})

const TENANT_TEXT = /^\{"organization":"org_[0-9a-z]{26}","account":"acc_[0-9a-z]{26}"\}$/

describe('register-and-activate and issue-login', () => {
  it('registers through identity and answers the three identities', async () => {
    fixture = await startFixture()
    const reply = await send(fixture.port, GOVERNANCE_PATH, {
      body: governance('register-and-activate', { loginIdentifier: 'alice', credential: 'pw-1' }),
    })
    expect(reply.status).toBe(200)
    const json = reply.json as { messageId: string; outcome: string; body: Record<string, string> }
    expect(json.messageId).toBe('m-1')
    expect(json.outcome).toBe('succeeded')
    expect(Object.keys(json.body).sort()).toEqual(['accountId', 'organizationId', 'tenantId'])
    expect(json.body.tenantId).toMatch(TENANT_TEXT)
    const again = await send(fixture.port, GOVERNANCE_PATH, {
      body: governance('register-and-activate', { loginIdentifier: 'alice', credential: 'pw-1' }),
    })
    expect(again.status).toBe(403)
    expect(again.json).toEqual({
      protocolVersion: 'governance-public/1',
      messageId: 'm-1',
      outcome: 'not-loginable',
      body: {},
    })
  })

  it('issues a login with the proof in the reply and answers uniform-auth-failure to a wrong credential', async () => {
    fixture = await startFixture()
    await send(fixture.port, GOVERNANCE_PATH, {
      body: governance('register-and-activate', { loginIdentifier: 'alice', credential: 'pw-1' }),
    })
    const issued = await send(fixture.port, GOVERNANCE_PATH, {
      body: governance('issue-login', { loginIdentifier: 'alice', credential: 'pw-1' }, {}, 'm-7'),
    })
    expect(issued.status).toBe(200)
    const json = issued.json as { messageId: string; outcome: string; body: Record<string, string> }
    expect(json.messageId).toBe('m-7')
    expect(json.outcome).toBe('succeeded')
    expect(Object.keys(json.body).sort()).toEqual([
      'issuedAt',
      'loginId',
      'loginIdentifier',
      'loginProof',
      'tenantId',
    ])
    expect(json.body.loginProof).not.toBe('')
    // P-6: the identifier of the new login, for a later revoke-login; it is not the proof.
    expect(json.body.loginId).toMatch(/^lgn_[0-9a-z]{26}$/)
    expect(json.body.loginId).not.toBe(json.body.loginProof)
    const wrong = await send(fixture.port, GOVERNANCE_PATH, {
      body: governance('issue-login', { loginIdentifier: 'alice', credential: 'pw-2' }),
    })
    expect(wrong.status).toBe(401)
    expect((wrong.json as { outcome: string }).outcome).toBe('uniform-auth-failure')
    const unknown = await send(fixture.port, GOVERNANCE_PATH, {
      body: governance('issue-login', { loginIdentifier: 'nobody', credential: 'pw-2' }),
    })
    expect(unknown.status).toBe(401)
    expect((unknown.json as { outcome: string }).outcome).toBe('uniform-auth-failure')
  })

  it('writes an empty 500 and closes the connection when identity throws on issue-login', async () => {
    fixture = await startFixture({
      identity: base => ({
        registerAndActivate: input => base.registerAndActivate(input),
        recognizeLogin: input => base.recognizeLogin(input),
        issueLogin: () => Promise.reject(new Error('store exploded')),
      }),
    })
    await send(fixture.port, GOVERNANCE_PATH, {
      body: governance('register-and-activate', { loginIdentifier: 'alice', credential: 'pw-1' }),
    })
    const reply = await send(fixture.port, GOVERNANCE_PATH, {
      body: governance('issue-login', { loginIdentifier: 'alice', credential: 'pw-1' }),
    })
    expect(reply.status).toBe(500)
    expect(reply.body.byteLength).toBe(0)
    expect(reply.headers.connection).toBe('close')
  })
})

const ORG = 'org_abcdefghjkmnpqrstvwxyz2345'
const ACTING =
  '{"organization":"org_abcdefghjkmnpqrstvwxyz2345","account":"acc_abcdefghjkmnpqrstvwxyz2345"}'
const PROOF = { loginProof: 'some-proof' }
const PROOF_ACTING = { loginProof: 'some-proof', actingTenant: ACTING }

/** One well-formed request per declared operation: each passes the closed field check of step 3. */
const DECLARED: readonly (readonly [string, unknown, Record<string, unknown>])[] = [
  ['public-health', {}, {}],
  ['replace-credential', { currentCredential: 'pw-1', newCredential: 'pw-2' }, PROOF],
  ['query-organization', { organizationId: ORG }, PROOF_ACTING],
  [
    'open-affiliation-request',
    { superiorOrganizationId: ORG, subordinateOrganizationId: ORG },
    PROOF_ACTING,
  ],
  ['accept-affiliation-request', { requestId: 'r-1', expectedState: 'pending' }, PROOF_ACTING],
  ['reject-affiliation-request', { requestId: 'r-1', expectedState: 'pending' }, PROOF_ACTING],
  ['withdraw-affiliation-request', { requestId: 'r-1', expectedState: 'pending' }, PROOF_ACTING],
  ['release-affiliation', { affiliationId: 'a-1', expectedState: 'effective' }, PROOF_ACTING],
  ['query-received-affiliation-requests', {}, PROOF_ACTING],
  ['query-issued-affiliation-requests', {}, PROOF_ACTING],
  ['query-affiliation-request', { requestId: 'r-1' }, PROOF_ACTING],
  ['judge-admission', { resource: 'r', action: 'a', parameters: {}, scopeId: 's' }, PROOF_ACTING],
  [
    'submit-authorization-expression',
    { expression: 'e', action: 'a', object: 'o', parameters: {} },
    PROOF_ACTING,
  ],
  ['withdraw-authorization-expression', { expressionId: 'x-1' }, PROOF_ACTING],
]

/** The eighteen governed operations of the identity spec F2. */
const GOVERNED = [
  'create-organization',
  'query-create-organization',
  'issue-member-invitation',
  'accept-member-invitation',
  'reject-member-invitation',
  'withdraw-member-invitation',
  'query-invitation',
  'query-received-invitations',
  'query-issued-invitations',
  'query-own-memberships',
  'query-organization-members',
  'leave-organization',
  'remove-member',
  'change-member-role',
  'switch-current-tenant',
  'query-current-tenant',
  'revoke-login',
  'query-own-valid-logins',
]

function countingRecognition(): Readonly<{
  calls: string[]
  wrap: (base: IdentityOperations) => IdentityOperations
}> {
  const calls: string[] = []
  return {
    calls,
    wrap: base => ({
      registerAndActivate: input => base.registerAndActivate(input),
      issueLogin: input => base.issueLogin(input),
      recognizeLogin: input => {
        calls.push(input.loginProof)
        return base.recognizeLogin(input)
      },
    }),
  }
}

describe('operations this deployment does not provide', () => {
  it('declares exactly the fourteen operations; with the two, the eighteen and the four setting operations they are the 38', () => {
    expect([...NOT_PROVIDED_GOVERNANCE_OPERATIONS].sort()).toEqual(
      DECLARED.map(([operation]) => operation).sort(),
    )
    const all = new Set([
      ...NOT_PROVIDED_GOVERNANCE_OPERATIONS,
      ...GOVERNED,
      ...SETTING_OPERATIONS,
      'register-and-activate',
      'issue-login',
    ])
    expect(all.size).toBe(38)
  })

  it('answers stage-not-provided to the four stage operations even with a bad body or proof', async () => {
    fixture = await startFixture()
    for (const operation of [
      'disable-subject',
      'restore-subject',
      'end-subject',
      'reopen-after-media-loss',
    ]) {
      const reply = await send(fixture.port, GOVERNANCE_PATH, {
        body: governance(operation, { anything: 1 }, { loginProof: 'bad', extra: true }, 'm-9'),
      })
      expect(reply.status, operation).toBe(501)
      expect(reply.json).toEqual({
        protocolVersion: 'governance-public/1',
        messageId: 'm-9',
        outcome: 'stage-not-provided',
        body: {},
      })
    }
  })

  it('answers stage-not-provided to each declared operation without recognizing the login', async () => {
    const recognition = countingRecognition()
    fixture = await startFixture({ identity: recognition.wrap })
    for (const [operation, body, extra] of DECLARED) {
      const reply = await send(fixture.port, GOVERNANCE_PATH, {
        body: governance(operation, body, extra, 'm-3'),
      })
      expect(reply.status, operation).toBe(501)
      expect(reply.json, operation).toEqual({
        protocolVersion: 'governance-public/1',
        messageId: 'm-3',
        outcome: 'stage-not-provided',
        body: {},
      })
    }
    expect(recognition.calls).toEqual([])
    // Control: a governed operation with the same proof does reach the recognition.
    const governedReply = await send(fixture.port, GOVERNANCE_PATH, {
      body: governance('query-current-tenant', {}, PROOF),
    })
    expect(governedReply.status).toBe(403)
    expect(recognition.calls).toEqual(['some-proof'])
  })

  it('answers protocol-rejected to a declared operation with bad fields', async () => {
    fixture = await startFixture()
    const badFields = await send(fixture.port, GOVERNANCE_PATH, {
      body: governance('judge-admission', { resource: 'r' }, PROOF_ACTING, 'm-4'),
    })
    expect(badFields.status).toBe(400)
    expect(badFields.json).toEqual({
      protocolVersion: 'governance-public/1',
      messageId: 'm-4',
      outcome: 'protocol-rejected',
      body: {},
    })
  })
})

describe('protocol rejections', () => {
  it('rejects bad JSON, another version, the session version and an unknown operation', async () => {
    fixture = await startFixture()
    const cases: readonly (readonly [string, string, string | undefined])[] = [
      ['bad json', '{"protocolVersion":"governance-public/1","messageId":"m-1",', undefined],
      [
        'other version',
        JSON.stringify({
          protocolVersion: 'governance-public/2',
          messageId: 'm-2',
          operation: 'public-health',
          body: {},
        }),
        'm-2',
      ],
      [
        'session version',
        JSON.stringify({
          protocolVersion: 'session-public/1',
          messageId: 'm-3',
          operation: 'create-session',
          body: {},
        }),
        'm-3',
      ],
      ['unknown operation', governance('fly', {}, {}, 'm-5'), 'm-5'],
      [
        'duplicate version',
        '{"protocolVersion":"governance-public/1","protocolVersion":"x","messageId":"m-6","operation":"public-health","body":{}}',
        'm-6',
      ],
    ]
    for (const [name, body, messageId] of cases) {
      const reply = await send(fixture.port, GOVERNANCE_PATH, { body })
      expect(reply.status, name).toBe(400)
      expect(reply.json, name).toEqual({
        protocolVersion: 'governance-public/1',
        ...(messageId === undefined ? {} : { messageId }),
        outcome: 'protocol-rejected',
        body: {},
      })
    }
  })

  it('does not read the message when a request has no body', async () => {
    fixture = await startFixture()
    const reply = await send(fixture.port, GOVERNANCE_PATH, { body: '' })
    expect(reply.status).toBe(400)
    expect(reply.json).toEqual({
      protocolVersion: 'governance-public/1',
      outcome: 'protocol-rejected',
      body: {},
    })
  })
})

describe('the entry does not verify a login on the governance location', () => {
  it('never calls recognizeLogin for register-and-activate or issue-login', async () => {
    const recognized: string[] = []
    fixture = await startFixture({
      identity: (base): IdentityOperations => ({
        registerAndActivate: input => base.registerAndActivate(input),
        issueLogin: input => base.issueLogin(input),
        recognizeLogin: input => {
          recognized.push(input.loginProof)
          return base.recognizeLogin(input)
        },
      }),
    })
    await send(fixture.port, GOVERNANCE_PATH, {
      body: governance('register-and-activate', { loginIdentifier: 'alice', credential: 'pw-1' }),
    })
    await send(fixture.port, GOVERNANCE_PATH, {
      body: governance('issue-login', { loginIdentifier: 'alice', credential: 'pw-1' }),
    })
    expect(recognized).toEqual([])
  })
})
