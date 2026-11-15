import {
  systemScope,
  tenantCodec,
  tenantScope,
  type ActingScope,
  type TenantId,
} from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'

export type SystemPrincipal = Readonly<{ kind: 'system'; component: string }>

export type WorkRef = Readonly<{ owner: string; work: string }>

export type ActingForTenantPrincipal = Readonly<{
  kind: 'acting-for-tenant'
  actor: SystemPrincipal
  tenant: TenantId
  work: WorkRef
}>

export type Principal = SystemPrincipal | ActingForTenantPrincipal

export type IssueFailure = Readonly<{
  field: 'component' | 'actor' | 'tenant' | 'work.owner' | 'work.work'
  reason: 'type' | 'empty' | 'unissued' | 'unminted'
}>

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

export interface PrincipalVerifier {
  verify(value: unknown): Promise<PrincipalVerification>
}

export type PrincipalAuthority = Readonly<{ issuer: PrincipalIssuer; verifier: PrincipalVerifier }>

export function scopeOf(principal: Principal): ActingScope {
  return principal.kind === 'system' ? systemScope() : tenantScope(principal.tenant)
}

function isText(value: unknown): value is string {
  return typeof value === 'string'
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
}

function textMember(value: unknown, field: IssueFailure['field']): Outcome<string, IssueFailure> {
  if (!isText(value)) return fail({ field, reason: 'type' })
  if (value.length === 0) return fail({ field, reason: 'empty' })
  return succeed(value)
}

function isMintedTenant(value: TenantId): boolean {
  return tenantCodec.encode(value).ok
}

export function inProcessPrincipalAuthority(): PrincipalAuthority {
  const issued = new WeakSet<object>()

  const isIssued = (value: unknown): value is Principal =>
    typeof value === 'object' && value !== null && issued.has(value)

  const register = <T extends Principal>(principal: T): T => {
    issued.add(Object.freeze(principal))
    return principal
  }

  const issueSystem: PrincipalIssuer['issueSystem'] = input => {
    const component = textMember(isObject(input) ? input.component : undefined, 'component')
    if ('failure' in component) return component
    return succeed(register({ kind: 'system', component: component.ok }))
  }

  const issueActingForTenant: PrincipalIssuer['issueActingForTenant'] = input => {
    if (!isObject(input)) return fail({ field: 'actor', reason: 'type' })
    if (!isIssued(input.actor) || input.actor.kind !== 'system')
      return fail({ field: 'actor', reason: 'unissued' })
    if (!isMintedTenant(input.tenant)) return fail({ field: 'tenant', reason: 'unminted' })
    const given: unknown = input.work
    if (!isObject(given)) return fail({ field: 'work.owner', reason: 'type' })
    const owner = textMember(given.owner, 'work.owner')
    if ('failure' in owner) return owner
    const work = textMember(given.work, 'work.work')
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
