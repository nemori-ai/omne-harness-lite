import type {
  AccessIdentity,
  ActForResult,
  LoginIdentity,
  LoginResult,
} from '@omne-harness/access-cordis-contract'
import type {
  IdentityGovernance,
  IdentityOperations,
  PrincipalIssuer,
  SystemPrincipal,
  TenantStandingSource,
} from '@omne-harness/identity'
import {
  accountEquals,
  loginStateCodec,
  tenantCodec,
  type TenantId,
} from '@omne-harness/legal-identity'
import { callerOf, LOGIN_WORK_OWNER, loginIdentityOf, loginTextOf, principalOf } from './caller.ts'

export type AccessIdentityDependencies = Readonly<{
  operations: IdentityOperations
  governance: IdentityGovernance
  issuer: PrincipalIssuer
}>

export type MemberActingDependencies = Readonly<{
  identity: Pick<AccessIdentity, 'actFor'>
  standing: Pick<TenantStandingSource, 'read'>
}>

const ENTRY_COMPONENT = 'server-entry'

const DENIED = Object.freeze({ outcome: 'denied' as const })
const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })

function ownTenant(login: LoginIdentity, tenant: string): TenantId | undefined {
  const target = tenantCodec.parse(tenant)
  return target.ok && accountEquals(target.value.account, callerOf(login).account)
    ? target.value
    : undefined
}

export function createMemberActing(deps: MemberActingDependencies): AccessIdentity['actFor'] {
  const { identity, standing } = deps
  return async (login, tenant) => {
    const target = ownTenant(login, tenant)
    if (target === undefined) return DENIED
    let reading
    try {
      reading = await standing.read({ tenant: target })
    } catch {
      return UNAVAILABLE
    }
    if (reading.kind === 'unavailable') return UNAVAILABLE
    return reading.kind === 'member' ? identity.actFor(login, tenant) : DENIED
  }
}

export function createAccessIdentity(
  deps: AccessIdentityDependencies,
): AccessIdentity & Readonly<{ resume(tenant: string, loginText: string): ActForResult }> {
  const { operations, governance, issuer } = deps
  let actor: SystemPrincipal | undefined

  const systemPrincipal = (): SystemPrincipal | undefined => {
    if (actor !== undefined) return actor
    const issued = issuer.issueSystem({ component: ENTRY_COMPONENT })
    if ('failure' in issued) return undefined
    actor = issued.ok
    return actor
  }

  const issueFor = (tenant: TenantId, loginText: string): ActForResult => {
    try {
      const system = systemPrincipal()
      if (system === undefined) return UNAVAILABLE
      const issued = issuer.issueActingForTenant({
        actor: system,
        tenant,
        work: { owner: LOGIN_WORK_OWNER, work: loginText },
      })
      if ('failure' in issued) return UNAVAILABLE
      return { outcome: 'issued', principal: principalOf(issued.ok) }
    } catch {
      return UNAVAILABLE
    }
  }

  return {
    async identifyLogin(proof): Promise<LoginResult> {
      let recognition
      try {
        recognition = await operations.recognizeLogin({ loginProof: proof })
      } catch {
        return UNAVAILABLE
      }
      if (recognition.kind === 'invalid') return DENIED
      if (recognition.kind === 'basis-unavailable') return UNAVAILABLE
      const login = loginIdentityOf({
        account: recognition.account,
        login: recognition.login,
        loginText: loginTextOf(recognition.login),
        tenant: recognition.tenant,
      })
      return { outcome: 'identified', login }
    },

    async actFor(login, tenant): Promise<ActForResult> {
      const target = ownTenant(login, tenant)
      return target === undefined ? DENIED : issueFor(target, callerOf(login).loginText)
    },

    async resumeLogin(loginText, tenant): Promise<LoginResult> {
      const target = tenantCodec.parse(tenant)
      const login = loginStateCodec.parse(loginText)
      if (!target.ok || !login.ok) return DENIED
      const caller = {
        account: target.value.account,
        login: login.value,
        loginText,
        tenant: target.value,
      }
      return { outcome: 'identified', login: loginIdentityOf(caller) }
    },

    resume(tenant, loginText): ActForResult {
      const target = tenantCodec.parse(tenant)
      return target.ok ? issueFor(target.value, loginText) : DENIED
    },

    async reportAccess(login): Promise<void> {
      const report = await governance.reportBusinessAccess({ login: callerOf(login).login })
      if (report.kind === 'basis-unavailable')
        throw new Error('identity-access: the business access was not reported')
    },
  }
}
