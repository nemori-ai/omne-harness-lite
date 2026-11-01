// The field-level cases of the identity derivation: each family changes with one field, and the
// messageId enters no identity. The digest algorithm itself is Session's `deriveIngressOperation`.
import { afterEach, describe, expect, it } from 'vitest'
import {
  acceptOperation,
  controlOperation,
  createOperation,
  inputIdentity,
  loginEntryOrigin,
  sessionIdentity,
} from '../src/derivation.ts'
import {
  SESSION_PATH,
  createSession,
  login,
  send,
  sessionMessage,
  startFixture,
  type Fixture,
} from './support/harness.ts'

const TENANT =
  '{"organization":"org_abcdefghjkmnpqrstvwxyz2345","account":"acc_abcdefghjkmnpqrstvwxyz2345"}'
const OTHER_TENANT =
  '{"organization":"org_abcdefghjkmnpqrstvwxyz2346","account":"acc_abcdefghjkmnpqrstvwxyz2345"}'
const SESSION = 'a'.repeat(64)
const LOGIN = 'lgn_abcdefghjkmnpqrstvwxyz2345'
const OTHER_LOGIN = 'lgn_abcdefghjkmnpqrstvwxyz2346'

describe('one field changes the identity', () => {
  it('create: tenant text and createCallId', () => {
    const base = createOperation(TENANT, 'c1')
    expect(createOperation(TENANT, 'c1')).toBe(base)
    expect(createOperation(OTHER_TENANT, 'c1')).not.toBe(base)
    expect(createOperation(TENANT, 'c2')).not.toBe(base)
    expect(base).toMatch(/^sop_[0-9a-f]{64}$/)
  })

  it('accept: tenant text, session text and acceptId', () => {
    const base = acceptOperation(TENANT, SESSION, 'a1')
    expect(acceptOperation(TENANT, SESSION, 'a1')).toBe(base)
    expect(acceptOperation(OTHER_TENANT, SESSION, 'a1')).not.toBe(base)
    expect(acceptOperation(TENANT, 'b'.repeat(64), 'a1')).not.toBe(base)
    expect(acceptOperation(TENANT, SESSION, 'a2')).not.toBe(base)
  })

  it('control: login text, tenant text, session text and controlId', () => {
    const base = controlOperation(LOGIN, TENANT, SESSION, 'k1')
    expect(controlOperation(LOGIN, TENANT, SESSION, 'k1')).toBe(base)
    expect(controlOperation(OTHER_LOGIN, TENANT, SESSION, 'k1')).not.toBe(base)
    expect(controlOperation(LOGIN, OTHER_TENANT, SESSION, 'k1')).not.toBe(base)
    expect(controlOperation(LOGIN, TENANT, 'b'.repeat(64), 'k1')).not.toBe(base)
    expect(controlOperation(LOGIN, TENANT, SESSION, 'k2')).not.toBe(base)
  })

  it('the three families never share an identity for the same fields', () => {
    const fields = [TENANT, SESSION, 'x']
    const ids = new Set([
      createOperation(fields[0]!, fields[1]!),
      acceptOperation(fields[0]!, fields[1]!, fields[2]!),
      controlOperation(fields[0]!, fields[1]!, fields[2]!, fields[2]!),
    ])
    expect(ids.size).toBe(3)
  })

  it('session and input identities are 64 lowercase hex characters and follow their fields', () => {
    const session = sessionIdentity(TENANT, 'c1')
    expect(session).toMatch(/^[0-9a-f]{64}$/)
    expect(sessionIdentity(TENANT, 'c2')).not.toBe(session)
    expect(sessionIdentity(OTHER_TENANT, 'c1')).not.toBe(session)
    const input = inputIdentity(TENANT, SESSION, 'i1')
    expect(input).toMatch(/^[0-9a-f]{64}$/)
    expect(inputIdentity(TENANT, SESSION, 'i2')).not.toBe(input)
    expect(inputIdentity(TENANT, 'b'.repeat(64), 'i1')).not.toBe(input)
  })

  it('the login-entry origin names the login and digests the account and login only', () => {
    const origin = loginEntryOrigin('acc_abcdefghjkmnpqrstvwxyz2345', LOGIN)
    expect(origin).toEqual({
      owner: 'login-entry',
      record: LOGIN,
      revision: '1',
      digest: expect.stringMatching(/^[0-9a-f]{64}$/),
    })
    expect(loginEntryOrigin('acc_abcdefghjkmnpqrstvwxyz2345', OTHER_LOGIN).digest).not.toBe(
      origin.digest,
    )
  })
})

describe('messageId enters no identity', () => {
  let fixture: Fixture | undefined
  afterEach(async () => {
    await fixture?.stop()
    fixture = undefined
  })

  it('two sends that differ only in messageId reach Session with the same operation', async () => {
    fixture = await startFixture()
    const who = await login(fixture, 'alice')
    const session = await createSession(fixture, who)
    for (const messageId of ['m-a', 'm-b']) {
      const reply = await send(fixture.port, SESSION_PATH, {
        body: sessionMessage(
          'cancel-run',
          { tenant: who.tenantText, session, controlId: 'k1', run: 'r1', urgency: 'graceful' },
          { loginProof: who.loginProof },
          messageId,
        ),
      })
      expect(reply.status).toBe(404)
      expect((reply.json as { messageId: string }).messageId).toBe(messageId)
    }
    const ops = fixture.session.controls
      .calls()
      .filter(c => c.method === 'cancelRun')
      .map(c => c.operation)
    expect(ops.length).toBe(2)
    expect(ops[0]).toBe(ops[1])
  })
})
