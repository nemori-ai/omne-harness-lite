import { describe, expect, it } from 'vitest'
import { inProcessPrincipalAuthority, type ActingForTenantPrincipal } from '@omne-harness/identity'
import { createAccessIdentity } from '@omne-harness/identity-access'
import {
  adjustableInvitationTerms,
  adjustableLoginTerms,
  inProcessIdentity,
  manualIdentityClock,
} from '@omne-harness/identity/testing'
import { tenantCodec } from '@omne-harness/legal-identity'
import { parseDuration, parseInstant } from '@omne-harness/utc-instant'

function duration(text: string) {
  const parsed = parseDuration(text)
  if (!parsed.ok) throw new Error(`fixture duration ${text} did not parse`)
  return parsed.value
}

function world() {
  const start = parseInstant('2026-11-13T00:00:00Z')
  if (!start.ok) throw new Error('fixture time did not parse')
  const identity = inProcessIdentity({
    clock: manualIdentityClock(start.value).clock,
    terms: adjustableLoginTerms({
      maxLifetime: duration('PT3600S'),
      idlePeriod: duration('PT600S'),
    }).source,
    invitationTerms: adjustableInvitationTerms({
      defaultDuration: duration('PT604800S'),
      maxDuration: duration('PT2592000S'),
    }).source,
  })
  const authority = inProcessPrincipalAuthority()
  const access = createAccessIdentity({
    operations: identity.operations,
    governance: identity.governance,
    issuer: authority.issuer,
  })
  return { identity, access }
}

async function signIn(operations: ReturnType<typeof world>['identity']['operations']) {
  const issued = await operations.issueLogin({ loginIdentifier: 'alice', credential: 'secret' })
  if (issued.kind !== 'succeeded') throw new Error('fixture login failed')
  const encoded = tenantCodec.encode(issued.tenant)
  if (!encoded.ok) throw new Error('fixture tenant is not minted')
  return { proof: issued.loginProof, tenantText: encoded.value }
}

describe('the principal port the diagnostics row hands to the plugin', () => {
  it('still issues for a login that was revoked after it was identified: it judges the account of the tenant, not the life of the login', async () => {
    const { identity, access } = world()
    const registered = await identity.operations.registerAndActivate({
      loginIdentifier: 'alice',
      credential: 'secret',
    })
    if (registered.kind !== 'succeeded') throw new Error('fixture registration failed')
    const keeping = await signIn(identity.operations)
    const sending = await signIn(identity.operations)
    const identified = await access.identifyLogin(sending.proof)
    if (identified.outcome !== 'identified') throw new Error('the sending login is not identified')
    const keeper = await identity.operations.recognizeLogin({ loginProof: keeping.proof })
    const sender = await identity.operations.recognizeLogin({ loginProof: sending.proof })
    if (keeper.kind !== 'recognized' || sender.kind !== 'recognized')
      throw new Error('fixture logins were not recognized')

    expect(
      await identity.governance.revokeLogin({ login: keeper.login, target: sender.login }),
    ).toEqual({ kind: 'succeeded' })
    expect(await access.identifyLogin(sending.proof)).toEqual({ outcome: 'denied' })

    const issued = await access.actFor(identified.login, sending.tenantText)
    expect(issued.outcome).toBe('issued')
    if (issued.outcome !== 'issued') return
    expect((issued.principal as unknown as ActingForTenantPrincipal).kind).toBe('acting-for-tenant')
  })
})
