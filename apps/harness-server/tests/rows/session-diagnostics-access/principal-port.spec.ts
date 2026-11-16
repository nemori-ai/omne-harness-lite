import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TEAM_MODEL,
  DEFAULT_TEAM_ROLES,
  inProcessPrincipalAuthority,
  type ActingForTenantPrincipal,
  type TenantStandingReading,
  type TenantStandingSource,
} from '@omne-harness/identity'
import { createAccessIdentity, createMemberActing } from '@omne-harness/identity-access'
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

type Standing = 'member' | 'not-member' | 'unavailable'

function standingDouble(answer: () => Standing): Pick<TenantStandingSource, 'read'> {
  const evidence = { record: 'fixture-record', revision: '1' }
  return {
    async read(): Promise<TenantStandingReading> {
      const next = answer()
      if (next === 'unavailable') return { kind: 'unavailable', diagnostic: 'fixture' }
      if (next === 'not-member') return { kind: 'not-member', evidence }
      return {
        kind: 'member',
        role: { model: DEFAULT_TEAM_MODEL, role: DEFAULT_TEAM_ROLES.member },
        qualifications: [],
        evidence,
      }
    },
  }
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
  let standing: Standing = 'member'
  const access = createAccessIdentity({
    operations: identity.operations,
    governance: identity.governance,
    issuer: authority.issuer,
  })
  return {
    identity,
    access,
    actingFor: createMemberActing({
      identity: access,
      standing: standingDouble(() => standing),
    }),
    answer(next: Standing) {
      standing = next
    },
  }
}

type World = ReturnType<typeof world>

async function signIn(operations: World['identity']['operations']) {
  const issued = await operations.issueLogin({ loginIdentifier: 'alice', credential: 'secret' })
  if (issued.kind !== 'succeeded') throw new Error('fixture login failed')
  const encoded = tenantCodec.encode(issued.tenant)
  if (!encoded.ok) throw new Error('fixture tenant is not minted')
  return { proof: issued.loginProof, tenantText: encoded.value }
}

async function signedUp() {
  const w = world()
  const registered = await w.identity.operations.registerAndActivate({
    loginIdentifier: 'alice',
    credential: 'secret',
  })
  if (registered.kind !== 'succeeded') throw new Error('fixture registration failed')
  const signed = await signIn(w.identity.operations)
  const identified = await w.access.identifyLogin(signed.proof)
  if (identified.outcome !== 'identified') throw new Error('the login is not identified')
  return { ...w, signed, login: identified.login }
}

describe('the principal port the diagnostics row hands to the plugin', () => {
  it('still issues for a login that was revoked after it was identified: it judges the account of the tenant, not the life of the login', async () => {
    const { identity, access, actingFor } = world()
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

    const issued = await actingFor(identified.login, sending.tenantText)
    expect(issued.outcome).toBe('issued')
    if (issued.outcome !== 'issued') return
    expect((issued.principal as unknown as ActingForTenantPrincipal).kind).toBe('acting-for-tenant')
  })

  it('does not issue for a tenant whose standing says not a member, and does not answer for one it cannot read', async () => {
    const { actingFor, answer, login, signed } = await signedUp()

    answer('not-member')
    expect(await actingFor(login, signed.tenantText)).toEqual({ outcome: 'denied' })

    answer('unavailable')
    expect(await actingFor(login, signed.tenantText)).toEqual({ outcome: 'basis-unavailable' })
  })

  it('issues for the own tenant while the standing says member', async () => {
    const { actingFor, answer, login, signed } = await signedUp()
    answer('member')

    const own = await actingFor(login, signed.tenantText)

    expect(own.outcome).toBe('issued')
    if (own.outcome !== 'issued') return
    expect((own.principal as unknown as ActingForTenantPrincipal).kind).toBe('acting-for-tenant')
  })
})
