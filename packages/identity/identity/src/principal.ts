// The two system-side principals (SPEC ID-16): a system principal that acts for no tenant, and a
// principal that acts for one tenant on behalf of the tenant's own account. Identity issues them;
// the application assembly only installs the issuer. A consumer re-checks an acting principal by
// the current standing of `tenant.account` in `tenant.organization`, so a revoked membership makes
// the next check deny.
import {
  systemScope,
  tenantCodec,
  tenantScope,
  type ActingScope,
  type TenantId,
} from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'

/** A part of the system that acts for no tenant: a scanner, a directory reader, a coordinator. */
export type SystemPrincipal = Readonly<{ kind: 'system'; component: string }>

/** The original work that an acting principal acts for. Opaque text that the work owner gave. */
export type WorkRef = Readonly<{ owner: string; work: string }>

/**
 * A system part acting for one tenant. The original subject is the tenant's own account; it is
 * kept inside `tenant`, so a check reads that account's current standing, not the actor's. There
 * is no form without a tenant.
 */
export type ActingForTenantPrincipal = Readonly<{
  kind: 'acting-for-tenant'
  actor: SystemPrincipal
  tenant: TenantId
  work: WorkRef
}>

export type Principal = SystemPrincipal | ActingForTenantPrincipal

/** Why an issue request was refused. `field` names the input member. */
export type IssueFailure = Readonly<{
  field: 'component' | 'actor' | 'tenant' | 'work.owner' | 'work.work'
  reason: 'type' | 'empty' | 'unissued' | 'unminted'
}>

/** Issues principals. Only identity provides it; the assembly installs it where principals are made. */
export interface PrincipalIssuer {
  issueSystem(input: Readonly<{ component: string }>): Outcome<SystemPrincipal, IssueFailure>
  issueActingForTenant(
    input: Readonly<{ actor: SystemPrincipal; tenant: TenantId; work: WorkRef }>,
  ): Outcome<ActingForTenantPrincipal, IssueFailure>
}

export type PrincipalVerification =
  | Readonly<{ kind: 'verified'; principal: Principal }>
  | Readonly<{ kind: 'rejected' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/**
 * Verifies that a value is a principal this authority issued. A hand-built copy of the same shape
 * is `rejected`. A verifier that cannot answer says `unavailable`, never `verified`.
 */
export interface PrincipalVerifier {
  verify(value: unknown): Promise<PrincipalVerification>
}

export type PrincipalAuthority = Readonly<{ issuer: PrincipalIssuer; verifier: PrincipalVerifier }>

/** The acting scope of a principal. Throws TypeError for a hand-built acting principal. */
export function scopeOf(principal: Principal): ActingScope {
  return principal.kind === 'system' ? systemScope() : tenantScope(principal.tenant)
}

function isText(value: unknown): value is string {
  return typeof value === 'string'
}

function textMember(value: unknown, field: IssueFailure['field']): Outcome<string, IssueFailure> {
  if (!isText(value)) return fail({ field, reason: 'type' })
  if (value.length === 0) return fail({ field, reason: 'empty' })
  return succeed(value)
}

function isMintedTenant(value: TenantId): boolean {
  return tenantCodec.encode(value).ok
}

/**
 * The in-process authority: a registry of the principals it issued. Verification is membership in
 * that registry, so it holds inside one process and one loaded copy of this module. A principal
 * does not keep its issue through JSON, a structured clone, a worker message or another process;
 * cross-process proof is a later provider's job.
 */
export function inProcessPrincipalAuthority(): PrincipalAuthority {
  const issued = new WeakSet<object>()

  // Only values built below enter the registry, so membership proves the claim.
  const isIssued = (value: unknown): value is Principal =>
    typeof value === 'object' && value !== null && issued.has(value)

  const register = <T extends Principal>(principal: T): T => {
    issued.add(Object.freeze(principal))
    return principal
  }

  const issueSystem: PrincipalIssuer['issueSystem'] = input => {
    const component = textMember(input.component, 'component')
    if ('failure' in component) return component
    return succeed(register({ kind: 'system', component: component.ok }))
  }

  const issueActingForTenant: PrincipalIssuer['issueActingForTenant'] = input => {
    if (!isIssued(input.actor) || input.actor.kind !== 'system')
      return fail({ field: 'actor', reason: 'unissued' })
    if (!isMintedTenant(input.tenant)) return fail({ field: 'tenant', reason: 'unminted' })
    const owner = textMember(input.work.owner, 'work.owner')
    if ('failure' in owner) return owner
    const work = textMember(input.work.work, 'work.work')
    if ('failure' in work) return work
    return succeed(
      register({
        kind: 'acting-for-tenant',
        actor: input.actor,
        tenant: input.tenant,
        work: Object.freeze({ owner: owner.ok, work: work.ok }),
      }),
    )
  }

  const verify: PrincipalVerifier['verify'] = value =>
    Promise.resolve(isIssued(value) ? { kind: 'verified', principal: value } : { kind: 'rejected' })

  return Object.freeze({
    issuer: Object.freeze({ issueSystem, issueActingForTenant }),
    verifier: Object.freeze({ verify }),
  })
}
