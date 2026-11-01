// The governance location: register and activate, issue a login, the four stage operations, the
// 32 operations this deployment does not provide, protocol rejections, and an identity fault.
import { afterEach, describe, expect, it } from 'vitest'
import type { IdentityOperations } from '@omne-harness/identity'
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
      'loginIdentifier',
      'loginProof',
      'tenantId',
    ])
    expect(json.body.loginProof).not.toBe('')
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

describe('operations this deployment does not provide', () => {
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

  it('answers stage-not-provided to a provided operation it does not offer, and protocol-rejected to its bad fields', async () => {
    fixture = await startFixture()
    const notOffered: readonly (readonly [string, unknown, Record<string, unknown>])[] = [
      ['public-health', {}, {}],
      ['query-current-tenant', {}, { loginProof: 'x' }],
      ['revoke-login', { targetLoginId: 'lgn_abcdefghjkmnpqrstvwxyz2345' }, { loginProof: 'x' }],
      [
        'judge-admission',
        { resource: 'r', action: 'a', parameters: {}, scopeId: 's' },
        {
          loginProof: 'x',
          actingTenant:
            '{"organization":"org_abcdefghjkmnpqrstvwxyz2345","account":"acc_abcdefghjkmnpqrstvwxyz2345"}',
        },
      ],
    ]
    for (const [operation, body, extra] of notOffered) {
      const reply = await send(fixture.port, GOVERNANCE_PATH, {
        body: governance(operation, body, extra, 'm-3'),
      })
      expect(reply.status, operation).toBe(501)
      expect(reply.json).toEqual({
        protocolVersion: 'governance-public/1',
        messageId: 'm-3',
        outcome: 'stage-not-provided',
        body: {},
      })
    }
    const badFields = await send(fixture.port, GOVERNANCE_PATH, {
      body: governance('query-current-tenant', { extra: 1 }, { loginProof: 'x' }, 'm-4'),
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
