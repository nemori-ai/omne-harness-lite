import type {
  AccessIdentity,
  ActForResult,
  LoginResult,
} from '@omne-harness/access-cordis-contract'
import type {
  IdentityGovernance,
  IdentityOperations,
  PrincipalIssuer,
  SystemPrincipal,
} from '@omne-harness/identity'
import { accountEquals, tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { callerOf, LOGIN_WORK_OWNER, loginIdentityOf, loginTextOf, principalOf } from './caller.ts'

export type AccessIdentityDependencies = Readonly<{
  operations: IdentityOperations
  governance: IdentityGovernance
  issuer: PrincipalIssuer
}>

const ENTRY_COMPONENT = 'server-entry'

const DENIED = Object.freeze({ outcome: 'denied' as const })
const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })

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
      const caller = callerOf(login)
      const target = tenantCodec.parse(tenant)
      if (!target.ok || !accountEquals(target.value.account, caller.account)) return DENIED
      return issueFor(target.value, caller.loginText)
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
