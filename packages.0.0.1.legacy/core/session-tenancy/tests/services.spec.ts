import { Context } from '@deepseek-ai/cordis'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import { expect, it } from 'vitest'
import {
  SESSION_ACCESS,
  SESSION_ACCESS_AUTHORITY,
  SESSION_TENANCY,
  SessionAccessAuthorityService,
  SessionAccessService,
  SessionTenancyService,
} from '../src/cordis.ts'
import type { AccessIdentity, AccessOperation, SessionScope } from '../src/index.ts'

// Fixture providers verify service integration, without issuing live access bindings.
class TenancyFixture extends SessionTenancyService {
  async holdingTenant() {
    return { failure: 'sessionNotFound' as const }
  }
}
class AccessFixture extends SessionAccessService {
  async authorize() {
    return { kind: 'rejected' as const, reason: 'notAuthorized' as const }
  }
}
class AuthorityFixture extends SessionAccessAuthorityService {
  readonly checks: { identity: AccessIdentity; operation: AccessOperation }[] = []
  async check(identity: AccessIdentity, operation: AccessOperation) {
    this.checks.push({ identity, operation })
    return { kind: 'rejected' as const, reason: 'ownerStopped' as const }
  }
}

it('binds all three exact service keys, forwards calls and removes visibility on withdrawal', async () => {
  const keys = [SESSION_TENANCY, SESSION_ACCESS, SESSION_ACCESS_AUTHORITY]
  expect(keys).toEqual(['sessionTenancy', 'sessionAccess', 'sessionAccessAuthority'])
  const tenant = parseTenantId({ organization: 'org', account: 'alice' })
  if ('invalidInput' in tenant) throw new Error(tenant.invalidInput)
  const session = parseOpaqueIdentifier('session-1', 'SessionRef')
  if ('invalidInput' in session) throw new Error(session.invalidInput)
  const scope: SessionScope = { tenant: tenant.ok, session: session.ok }
  const identity: AccessIdentity = {
    binding: 'live',
    principal: 'alice',
    principalKind: 'human',
    scope,
    consumer: 'coordinator',
    contextKeys: [],
  }
  const ctx = new Context()
  for (const key of keys) expect(ctx.get(key)).toBeUndefined()
  let authority: AuthorityFixture | undefined
  const provider = await ctx.plugin(inner => {
    new TenancyFixture(inner)
    new AccessFixture(inner)
    authority = new AuthorityFixture(inner)
  })
  try {
    expect(ctx.sessionTenancy).toBeInstanceOf(TenancyFixture)
    expect(ctx.sessionAccess).toBeInstanceOf(AccessFixture)
    expect(ctx.sessionAccessAuthority).toBeInstanceOf(AuthorityFixture)
    const consumer = await ctx.plugin({
      inject: keys,
      async apply(inner) {
        expect(await inner.sessionTenancy.holdingTenant(scope.session)).toEqual({
          failure: 'sessionNotFound',
        })
        expect(
          await inner.sessionAccessAuthority.check(identity, 'session.log.coordinate'),
        ).toEqual({
          kind: 'rejected',
          reason: 'ownerStopped',
        })
      },
    })
    await consumer.dispose()
    expect(authority?.checks).toEqual([{ identity, operation: 'session.log.coordinate' }])
    for (const key of keys) expect(ctx.get(key)).toBeDefined()
  } finally {
    await provider.dispose()
  }
  for (const key of keys) expect(ctx.get(key)).toBeUndefined()
})
