import {
  inProcessPrincipalAuthority,
  type IdentityGovernance,
  type IdentityOperations,
  type PrincipalAuthority,
} from '@omne-harness/identity'
import {
  adjustableInvitationTerms,
  adjustableLoginTerms,
  inProcessIdentity,
  manualIdentityClock,
} from '@omne-harness/identity/testing'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { parseDuration, parseInstant, type Duration } from '@omne-harness/utc-instant'

function duration(text: string): Duration {
  const parsed = parseDuration(text)
  if (!parsed.ok) throw new Error(`fixture duration ${text} did not parse`)
  return parsed.value
}

export type Fixture = Readonly<{
  operations: IdentityOperations
  governance: IdentityGovernance
  authority: PrincipalAuthority
}>

export function fixture(): Fixture {
  const start = parseInstant('2026-11-13T00:00:00Z')
  if (!start.ok) throw new Error('fixture time did not parse')
  const clock = manualIdentityClock(start.value)
  const identity = inProcessIdentity({
    clock: clock.clock,
    terms: adjustableLoginTerms({
      maxLifetime: duration('PT3600S'),
      idlePeriod: duration('PT600S'),
    }).source,
    invitationTerms: adjustableInvitationTerms({
      defaultDuration: duration('PT604800S'),
      maxDuration: duration('PT2592000S'),
    }).source,
  })
  return {
    operations: identity.operations,
    governance: identity.governance,
    authority: inProcessPrincipalAuthority(),
  }
}

export type SignedIn = Readonly<{
  proof: string
  tenant: TenantId
  tenantText: string
}>

export async function signUp(
  operations: IdentityOperations,
  loginIdentifier: string,
): Promise<SignedIn> {
  const credential = `secret-of-${loginIdentifier}`
  const registered = await operations.registerAndActivate({ loginIdentifier, credential })
  if (registered.kind !== 'succeeded') throw new Error('fixture registration failed')
  return signIn(operations, loginIdentifier)
}

export async function signIn(
  operations: IdentityOperations,
  loginIdentifier: string,
): Promise<SignedIn> {
  const issued = await operations.issueLogin({
    loginIdentifier,
    credential: `secret-of-${loginIdentifier}`,
  })
  if (issued.kind !== 'succeeded') throw new Error('fixture login failed')
  return { proof: issued.loginProof, tenant: issued.tenant, tenantText: textOf(issued.tenant) }
}

export function textOf(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('fixture tenant is not minted')
  return encoded.value
}

export function call<P>(principal: P) {
  return { principal, messageId: 'm-1', signal: new AbortController().signal }
}
