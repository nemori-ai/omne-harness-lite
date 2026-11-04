// The three model credential operations at the governance location (SPEC「模型凭据」): the login
// and acting tenant steps, the acting principal handed to the port, cross-tenant `denied` that does
// not disclose the other tenant's binding, the mapping of every port outcome, the absent port, and
// a secret that never reaches a response or a diagnostic.
import { afterEach, describe, expect, it } from 'vitest'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { ModelCredentialAccess, ModelCredentialCustody } from '@omne-harness/server-entry'
import { parseInstant, type Instant } from '@omne-harness/utc-instant'
import {
  GOVERNANCE_PATH,
  governed,
  login,
  send,
  startFixture,
  type Fixture,
  type HttpReply,
  type Login,
} from './support/harness.ts'

const SENTINEL = 'sk-or-v1-sentinel-c0ffee'
const AT_TEXT = '2026-11-04T08:00:00Z'
const parsed = parseInstant(AT_TEXT)
if (!parsed.ok) throw new Error('fixture instant')
const AT: Instant = parsed.value

let fixture: Fixture | undefined
afterEach(async () => {
  await fixture?.stop()
  fixture = undefined
})

type Seen = { operation: string; access: ModelCredentialAccess }

/** An in-memory custody keyed by tenant text. It records every call it receives. */
function custodyDouble() {
  const bound = new Map<string, Instant>()
  const seen: Seen[] = []
  const textOf = (access: ModelCredentialAccess) => {
    const encoded = tenantCodec.encode(access.tenant)
    if (!encoded.ok) throw new Error('unminted tenant')
    return encoded.value
  }
  const port: ModelCredentialCustody = {
    async bind({ access }) {
      seen.push({ operation: 'bind', access })
      bound.set(textOf(access), AT)
      return { kind: 'succeeded', configuredAt: AT }
    },
    async unbind({ access }) {
      seen.push({ operation: 'unbind', access })
      return bound.delete(textOf(access)) ? { kind: 'succeeded' } : { kind: 'no-change' }
    },
    async describe({ access }) {
      seen.push({ operation: 'describe', access })
      const at = bound.get(textOf(access))
      return {
        kind: 'succeeded',
        credential:
          at === undefined
            ? { state: 'unbound' }
            : { state: 'usable', tenantId: access.tenant, configuredAt: at },
      }
    },
  }
  return { port, seen, bound }
}

function call(
  who: Login,
  operation: string,
  body: unknown = {},
  acting: string | null = who.tenantText,
  messageId = 'm-1',
): Promise<HttpReply> {
  if (fixture === undefined) throw new Error('no fixture')
  return send(fixture.port, GOVERNANCE_PATH, {
    body: governed(who, operation, body, acting, messageId),
  })
}

function outcomeOf(reply: HttpReply): { outcome: string; body: unknown } {
  const json = reply.json as { outcome: string; body: unknown }
  return { outcome: json.outcome, body: json.body }
}

function withoutMessageId(reply: HttpReply): string {
  return reply.text.replace(/"messageId":"[^"]*",?/, '')
}

describe('with a custody port', () => {
  it('binds, describes and unbinds the credential of the acting tenant', async () => {
    const custody = custodyDouble()
    fixture = await startFixture({ dependencies: { modelCredentials: custody.port } })
    const alice = await login(fixture, 'alice')

    const bound = await call(alice, 'bind-model-credential', { secret: SENTINEL })
    expect(bound.status).toBe(200)
    expect(outcomeOf(bound)).toEqual({ outcome: 'succeeded', body: { configuredAt: AT_TEXT } })
    expect(outcomeOf(await call(alice, 'describe-model-credential'))).toEqual({
      outcome: 'succeeded',
      body: { state: 'usable', tenantId: alice.tenantText, configuredAt: AT_TEXT },
    })
    expect(outcomeOf(await call(alice, 'unbind-model-credential'))).toEqual({
      outcome: 'succeeded',
      body: {},
    })
    expect(outcomeOf(await call(alice, 'unbind-model-credential'))).toEqual({
      outcome: 'no-change',
      body: {},
    })
    expect(outcomeOf(await call(alice, 'describe-model-credential'))).toEqual({
      outcome: 'succeeded',
      body: { state: 'unbound' },
    })

    // The port saw the acting tenant and a principal issued for that tenant from this login.
    expect(custody.seen.map(item => item.operation)).toEqual([
      'bind',
      'describe',
      'unbind',
      'unbind',
      'describe',
    ])
    for (const { access } of custody.seen) {
      const principal: ActingForTenantPrincipal = access.principal
      expect(tenantCodec.encode(access.tenant)).toEqual({ ok: true, value: alice.tenantText })
      expect(tenantCodec.encode(principal.tenant)).toEqual({ ok: true, value: alice.tenantText })
      expect(principal.work.owner).toBe('identity-login')
    }
  })

  it('another tenant answers denied, the same bytes whether or not that tenant has a binding', async () => {
    const custody = custodyDouble()
    fixture = await startFixture({ dependencies: { modelCredentials: custody.port } })
    const alice = await login(fixture, 'alice')
    const bob = await login(fixture, 'bob')

    const probe = async () => {
      const replies = []
      for (const operation of [
        'describe-model-credential',
        'unbind-model-credential',
        'bind-model-credential',
      ])
        replies.push(
          await call(
            alice,
            operation,
            operation === 'bind-model-credential' ? { secret: SENTINEL } : {},
            bob.tenantText,
          ),
        )
      return replies
    }
    const beforeBob = await probe()
    expect(
      outcomeOf(await call(bob, 'bind-model-credential', { secret: 'bob-own' })),
    ).toMatchObject({
      outcome: 'succeeded',
    })
    const afterBob = await probe()
    for (const [index, reply] of [...beforeBob, ...afterBob].entries()) {
      expect(reply.status, `probe ${index}`).toBe(403)
      expect(outcomeOf(reply), `probe ${index}`).toEqual({ outcome: 'denied', body: {} })
      expect(withoutMessageId(reply)).toBe(withoutMessageId(beforeBob[0] as HttpReply))
    }
    // Neither probe reached the port, and Bob's binding is still there.
    expect(custody.seen.map(item => item.operation)).toEqual(['bind'])
    expect(outcomeOf(await call(bob, 'describe-model-credential'))).toMatchObject({
      body: { state: 'usable' },
    })
    // The same bytes as a request with a bad login proof.
    const badProof = await call(
      { ...alice, loginProof: 'not-a-proof' },
      'describe-model-credential',
    )
    expect(withoutMessageId(badProof)).toBe(withoutMessageId(beforeBob[0] as HttpReply))
  })

  it('a tenant of the same account that is not the current selection is denied', async () => {
    const custody = custodyDouble()
    fixture = await startFixture({ dependencies: { modelCredentials: custody.port } })
    const alice = await login(fixture, 'alice')
    const created = await call(alice, 'create-organization', {
      createCallId: 'c-1',
      name: 'Team',
      governanceModelId: 'default-team',
    })
    const team = (created.json as { body: { tenantId: string } }).body.tenantId
    expect(team).not.toBe(alice.tenantText)
    for (const operation of [
      'bind-model-credential',
      'unbind-model-credential',
      'describe-model-credential',
    ]) {
      const body = operation === 'bind-model-credential' ? { secret: SENTINEL } : {}
      expect(outcomeOf(await call(alice, operation, body, team)), operation).toEqual({
        outcome: 'denied',
        body: {},
      })
    }
    expect(custody.seen).toEqual([])
  })

  it('a principal that cannot be issued answers basis-unavailable and calls no port', async () => {
    const custody = custodyDouble()
    fixture = await startFixture({
      dependencies: { modelCredentials: custody.port },
      issuer: base => ({
        ...base,
        issueActingForTenant: () => ({ failure: { field: 'tenant', reason: 'unissued' } }),
      }),
    })
    const alice = await login(fixture, 'alice')
    expect(outcomeOf(await call(alice, 'bind-model-credential', { secret: SENTINEL }))).toEqual({
      outcome: 'basis-unavailable',
      body: {},
    })
    expect(custody.seen).toEqual([])
  })

  it('maps each refusal of the port to its outcome', async () => {
    const outcomes = ['denied', 'basis-unavailable', 'unknown'] as const
    for (const kind of outcomes) {
      const port: ModelCredentialCustody = {
        bind: async () => ({ kind }),
        unbind: async () => ({ kind }),
        describe: async () => (kind === 'unknown' ? { kind: 'basis-unavailable' } : { kind }),
      }
      fixture = await startFixture({ dependencies: { modelCredentials: port } })
      const alice = await login(fixture, 'alice')
      expect(outcomeOf(await call(alice, 'bind-model-credential', { secret: SENTINEL }))).toEqual({
        outcome: kind,
        body: {},
      })
      expect(outcomeOf(await call(alice, 'unbind-model-credential'))).toEqual({
        outcome: kind,
        body: {},
      })
      await fixture.stop()
      fixture = undefined
    }
  })

  it('a rejected write is unknown, a rejected read is basis-unavailable, and no text leaks', async () => {
    const port: ModelCredentialCustody = {
      bind: async ({ secret }) => {
        throw new Error(`disk full while writing ${secret}`)
      },
      unbind: async () => {
        throw new Error('disk full')
      },
      describe: async () => {
        throw new Error('disk full')
      },
    }
    fixture = await startFixture({ dependencies: { modelCredentials: port } })
    const alice = await login(fixture, 'alice')
    const bound = await call(alice, 'bind-model-credential', { secret: SENTINEL })
    expect(outcomeOf(bound)).toEqual({ outcome: 'unknown', body: {} })
    expect(outcomeOf(await call(alice, 'unbind-model-credential'))).toEqual({
      outcome: 'unknown',
      body: {},
    })
    expect(outcomeOf(await call(alice, 'describe-model-credential'))).toEqual({
      outcome: 'basis-unavailable',
      body: {},
    })
    expect(bound.text).not.toContain(SENTINEL)
    expect(fixture.diagnostics.filter(event => event.code === 'model-credential.fault')).toEqual([
      { code: 'model-credential.fault', operation: 'bind-model-credential' },
      { code: 'model-credential.fault', operation: 'unbind-model-credential' },
      { code: 'model-credential.fault', operation: 'describe-model-credential' },
    ])
    expect(JSON.stringify(fixture.diagnostics)).not.toContain(SENTINEL)
  })
})

describe('without a custody port', () => {
  it('the three operations are not provided, before the login is checked', async () => {
    fixture = await startFixture()
    const alice = await login(fixture, 'alice')
    for (const operation of [
      'bind-model-credential',
      'unbind-model-credential',
      'describe-model-credential',
    ]) {
      const body = operation === 'bind-model-credential' ? { secret: SENTINEL } : {}
      for (const who of [alice, { ...alice, loginProof: 'not-a-proof' }]) {
        const reply = await call(who, operation, body)
        expect(outcomeOf(reply), operation).toEqual({ outcome: 'stage-not-provided', body: {} })
        expect(reply.text).not.toContain(SENTINEL)
      }
    }
    // A request that fails the closed field check is still protocol-rejected.
    expect(outcomeOf(await call(alice, 'bind-model-credential', {})).outcome).toBe(
      'protocol-rejected',
    )
  })
})
