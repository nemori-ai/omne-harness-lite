import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Principal, PrincipalVerification, PrincipalVerifier } from '@omne-harness/identity'
import { tenantCodec, tenantEquals } from '@omne-harness/legal-identity'
import {
  decodePrincipalKey,
  type PrincipalBinding,
  type SourceDecision,
  type SourceRegistrationAuthority,
} from '@omne-harness/request-context-contract'
import type { RequestContextTrust } from '@omne-harness/request-context-cordis-contract'
import {
  RequestContextTrustService,
  requestContextTrustKey,
} from '@omne-harness/request-context-cordis-contract/cordis'
import { AGENT_CONTEXT_OWNER } from '../assembly/agent-context-owner.ts'
import type { EntryObjectModule } from '../types.ts'
import { sessionWorkOf } from '../rows/tool-runtime/session-work.ts'
import { sessionScopesOf } from './execution-wiring.ts'
import { ENTRY_COMPONENTS, verifierOf } from './principals.ts'
import type { SessionScopeOwnershipSource } from './session-scope-source.ts'

export type RegistrationAction = 'register' | 'replace'

export type RegistrationGrant = Readonly<{
  component: string
  owners: readonly string[]
  actions: readonly RegistrationAction[]
  ownSession?: boolean
}>

export const REGISTRATION_ALLOW_LIST: readonly RegistrationGrant[] = Object.freeze([
  Object.freeze({
    component: ENTRY_COMPONENTS.sessionWork,
    owners: Object.freeze([AGENT_CONTEXT_OWNER.owner]),
    actions: Object.freeze(['register' as const]),
    ownSession: true,
  }),
])

const DENIED: SourceDecision = Object.freeze({ kind: 'denied' })
const ALLOWED: SourceDecision = Object.freeze({ kind: 'allowed' })

async function verify(verifier: PrincipalVerifier, value: unknown): Promise<PrincipalVerification> {
  try {
    return await verifier.verify(value)
  } catch {
    return {
      kind: 'unavailable',
      diagnostic: 'the principal verifier threw an exception; its message is not reported',
    }
  }
}

export type RegistrationAuthorityOptions = Readonly<{
  verifier: PrincipalVerifier
  grants: readonly RegistrationGrant[]
  scopeOwners?: SessionScopeOwnershipSource
}>

async function ownSessionDecision(
  options: RegistrationAuthorityOptions,
  principal: Principal,
  target: Parameters<SourceRegistrationAuthority<Principal>['check']>[0]['target'],
): Promise<SourceDecision> {
  const work = sessionWorkOf(principal, target.tenant)
  if (work === undefined) return DENIED
  if (options.scopeOwners === undefined)
    return { kind: 'unavailable', diagnostic: 'the scope ownership source is not wired' }
  const owned = await options.scopeOwners.lookup(target.scope)
  switch (owned.kind) {
    case 'bound':
      return tenantEquals(owned.tenant, target.tenant) && owned.session === work.session
        ? ALLOWED
        : DENIED
    case 'unbound':
      return DENIED
    case 'unknown':
      return { kind: 'unknown' }
    default:
      return { kind: 'unavailable', diagnostic: 'the scope ownership is not readable' }
  }
}

export function createRegistrationAuthority(
  options: RegistrationAuthorityOptions,
): SourceRegistrationAuthority<Principal> {
  const check: SourceRegistrationAuthority<Principal>['check'] = async ({
    access,
    target,
    owner,
    action,
  }) => {
    const verification = await verify(options.verifier, access.principal)
    if (verification.kind === 'unavailable')
      return { kind: 'unavailable', diagnostic: verification.diagnostic }
    if (verification.kind === 'rejected') return DENIED
    const principal = verification.principal
    if (principal.kind !== 'acting-for-tenant') return DENIED
    if (
      !tenantEquals(principal.tenant, access.tenant) ||
      !tenantEquals(principal.tenant, target.tenant)
    )
      return DENIED
    const grant = options.grants.find(entry => entry.component === principal.actor.component)
    if (grant === undefined) return DENIED
    if (!grant.owners.includes(owner.owner) || !grant.actions.includes(action)) return DENIED
    return grant.ownSession === true ? ownSessionDecision(options, principal, target) : ALLOWED
  }
  return Object.freeze({ check })
}

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

function identityFieldsOf(principal: Principal, tenantText: string): readonly string[] {
  return principal.kind === 'system'
    ? ['system', principal.component, tenantText]
    : [
        'acting-for-tenant',
        principal.actor.component,
        tenantText,
        principal.work.owner,
        principal.work.work,
      ]
}

export function createPrincipalBinding(
  options: Readonly<{ verifier: PrincipalVerifier }>,
): PrincipalBinding<Principal> {
  const key: PrincipalBinding<Principal>['key'] = async access => {
    const verification = await verify(options.verifier, access.principal)
    if (verification.kind === 'unavailable')
      return { kind: 'unavailable', diagnostic: verification.diagnostic }
    if (verification.kind === 'rejected') return { kind: 'denied' }
    const principal = verification.principal
    if (principal.kind === 'acting-for-tenant' && !tenantEquals(principal.tenant, access.tenant))
      return { kind: 'denied' }
    const tenant = tenantCodec.encode(access.tenant)
    if (!tenant.ok) return { kind: 'invalid', field: 'tenant', reason: 'unsupported-format' }
    const decoded = decodePrincipalKey(
      `principal_${sha256(JSON.stringify(identityFieldsOf(principal, tenant.value)))}`,
    )
    return 'failure' in decoded
      ? { kind: 'unavailable', diagnostic: 'the principal key text was refused by its codec' }
      : { kind: 'value', value: decoded.ok }
  }
  return Object.freeze({ key })
}

class EntryRequestContextTrust extends RequestContextTrustService<Principal> {
  readonly principalBinding: RequestContextTrust<Principal>['principalBinding']
  readonly registrationAuthority: RequestContextTrust<Principal>['registrationAuthority']
  constructor(ctx: Context, trust: RequestContextTrust<Principal>) {
    super(ctx)
    this.principalBinding = trust.principalBinding
    this.registrationAuthority = trust.registrationAuthority
  }
}

export const requestContextTrust: EntryObjectModule = {
  name: requestContextTrustKey,
  implementation: 'real',
  install(scope, env) {
    const verifier = verifierOf(env)
    new EntryRequestContextTrust(scope, {
      principalBinding: createPrincipalBinding({ verifier }),
      registrationAuthority: createRegistrationAuthority({
        verifier,
        grants: REGISTRATION_ALLOW_LIST,
        scopeOwners: sessionScopesOf(env).scopeOwners,
      }),
    })
  },
}
