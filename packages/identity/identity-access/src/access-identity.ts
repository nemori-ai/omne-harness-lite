// The access entry's identity port (`AccessIdentity`, RFC-0015 §5), implemented by identity. The
// rules are those of the server entry's identity steps: the login proof goes to identity as given;
// the acting principal is issued only when the target tenant's account is the recognised account;
// identity's `denied` and `basis-unavailable` are not rewritten, and a throw is `basis-unavailable`.
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
import { accountEquals, tenantCodec } from '@omne-harness/legal-identity'
import { callerOf, LOGIN_WORK_OWNER, loginIdentityOf, loginTextOf, principalOf } from './caller.ts'

export type AccessIdentityDependencies = Readonly<{
  /** `recognizeLogin` is the one method used. */
  operations: IdentityOperations
  /** `reportBusinessAccess` is the one method used. */
  governance: IdentityGovernance
  /** The issuer of the holder that signs logins in (identity ID-16 holder table). */
  issuer: PrincipalIssuer
}>

/** The component of the system principal that acts for a tenant on behalf of a login. */
export const ENTRY_COMPONENT = 'server-entry'

const DENIED = Object.freeze({ outcome: 'denied' as const })
const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })

export function createAccessIdentity(deps: AccessIdentityDependencies): AccessIdentity {
  const { operations, governance, issuer } = deps
  let actor: SystemPrincipal | undefined

  const systemPrincipal = (): SystemPrincipal | undefined => {
    if (actor !== undefined) return actor
    const issued = issuer.issueSystem({ component: ENTRY_COMPONENT })
    if ('failure' in issued) return undefined
    actor = issued.ok
    return actor
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
      try {
        const system = systemPrincipal()
        if (system === undefined) return UNAVAILABLE
        const issued = issuer.issueActingForTenant({
          actor: system,
          tenant: target.value,
          work: { owner: LOGIN_WORK_OWNER, work: caller.loginText },
        })
        if ('failure' in issued) return UNAVAILABLE
        return { outcome: 'issued', principal: principalOf(issued.ok) }
      } catch {
        return UNAVAILABLE
      }
    },

    async reportAccess(login): Promise<void> {
      const report = await governance.reportBusinessAccess({ login: callerOf(login).login })
      // The pipeline records a rejected report as one diagnostic; the answer does not change.
      if (report.kind === 'basis-unavailable')
        throw new Error('identity-access: the business access was not reported')
    },
  }
}
