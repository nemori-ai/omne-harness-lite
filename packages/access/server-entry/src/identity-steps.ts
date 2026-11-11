// Steps 2 and 4 of the session judgment order (public contract「会话判断次序」, handoff「登录到
// Access」), also step 4 of the governance judgment order: the login proof goes to identity, and
// the acting principal is issued only when the target tenant's account is the recognized account.
// Identity's `denied` and `basis-unavailable` are not rewritten; a throwing identity or issuer is
// `basis-unavailable` (SPEC「服务端的 HTTP 层责任」). The report of a successful business access
// (identity ID-18) goes through here too: its result never changes an answer.
import {
  accountEquals,
  tenantEquals,
  type AccountId,
  type LoginStateId,
  type TenantId,
} from '@omne-harness/legal-identity'
import type {
  ActingForTenantPrincipal,
  IdentityGovernance,
  IdentityOperations,
  PrincipalIssuer,
  SystemPrincipal,
} from '@omne-harness/identity'
import type { ProofInput } from '@omne-harness/public-contract'
import { loginTextOf } from './derivation.ts'
import { emit, type DiagnosticSink } from './diagnostics.ts'

/** The caller a recognized login proof stands for. */
export type Caller = Readonly<{
  account: AccountId
  accountText: string
  login: LoginStateId
  loginText: string
  /** The login's current tenant selection. */
  tenant: TenantId
}>

export type StepRefusal = Readonly<{ outcome: 'denied' | 'basis-unavailable' }>

export const DENIED: StepRefusal = Object.freeze({ outcome: 'denied' })
export const UNAVAILABLE: StepRefusal = Object.freeze({ outcome: 'basis-unavailable' })

export function isRefusal(value: unknown): value is StepRefusal {
  return typeof value === 'object' && value !== null && 'outcome' in value
}

/** The component name of this entry's own system principal. */
export const COMPONENT = 'server-entry'
export const LOGIN_WORK_OWNER = 'identity-login'

export interface IdentitySteps {
  recognize(proof: ProofInput): Promise<Caller | StepRefusal>
  recheck(proof: ProofInput, caller: Caller, target: TenantId): Promise<StepRefusal | undefined>
  actingFor(caller: Caller, target: TenantId): Promise<ActingForTenantPrincipal | StepRefusal>
  /**
   * Reports one successful business access of the caller's login. It settles after identity
   * answered and never rejects: a failed report leaves a diagnostic and changes no answer.
   */
  reportBusinessAccess(caller: Caller): Promise<void>
}

export type IdentityStepsInput = Readonly<{
  identity: IdentityOperations
  governance: IdentityGovernance
  issuer: PrincipalIssuer
  diagnostics: DiagnosticSink | undefined
}>

export function createIdentitySteps(input: IdentityStepsInput): IdentitySteps {
  const { identity, governance, issuer, diagnostics } = input
  let actor: SystemPrincipal | undefined

  const systemPrincipal = (): SystemPrincipal | undefined => {
    if (actor !== undefined) return actor
    const issued = issuer.issueSystem({ component: COMPONENT })
    if ('failure' in issued) return undefined
    actor = issued.ok
    return actor
  }

  return {
    async recognize(proof) {
      // A missing or empty proof still goes to identity: the entry keeps no login table of its own.
      const loginProof = proof.kind === 'present' ? proof.value : ''
      let recognition
      try {
        recognition = await identity.recognizeLogin({ loginProof })
      } catch {
        emit(diagnostics, { code: 'identity.fault', operation: 'recognizeLogin' })
        return UNAVAILABLE
      }
      if (recognition.kind === 'invalid') return DENIED
      if (recognition.kind === 'basis-unavailable') return UNAVAILABLE
      return {
        account: recognition.account,
        accountText: recognition.account.text,
        login: recognition.login,
        loginText: loginTextOf(recognition.login),
        tenant: recognition.tenant,
      }
    },

    async recheck(proof, caller, target) {
      const recognized = await this.recognize(proof)
      if (isRefusal(recognized)) return recognized
      if (
        !accountEquals(recognized.account, caller.account) ||
        recognized.loginText !== caller.loginText
      )
        return DENIED
      try {
        const memberships = await governance.queryOwnMemberships({ login: recognized.login })
        if (memberships.kind === 'denied') return DENIED
        if (memberships.kind === 'basis-unavailable') return UNAVAILABLE
        return memberships.memberships.some(member => tenantEquals(member.tenant, target))
          ? undefined
          : DENIED
      } catch {
        emit(diagnostics, { code: 'identity.fault', operation: 'queryOwnMemberships' })
        return UNAVAILABLE
      }
    },

    async actingFor(caller, target) {
      if (!accountEquals(target.account, caller.account)) return DENIED
      try {
        const system = systemPrincipal()
        if (system === undefined) {
          emit(diagnostics, { code: 'issuer.fault', operation: 'issueSystem' })
          return UNAVAILABLE
        }
        const issued = issuer.issueActingForTenant({
          actor: system,
          tenant: target,
          work: { owner: LOGIN_WORK_OWNER, work: caller.loginText },
        })
        if ('failure' in issued) {
          emit(diagnostics, { code: 'issuer.fault', operation: 'issueActingForTenant' })
          return UNAVAILABLE
        }
        return issued.ok
      } catch {
        emit(diagnostics, { code: 'issuer.fault', operation: 'issueActingForTenant' })
        return UNAVAILABLE
      }
    },

    async reportBusinessAccess(caller) {
      try {
        const report = await governance.reportBusinessAccess({ login: caller.login })
        if (report.kind === 'basis-unavailable')
          emit(diagnostics, { code: 'identity.fault', operation: 'reportBusinessAccess' })
      } catch {
        emit(diagnostics, { code: 'identity.fault', operation: 'reportBusinessAccess' })
      }
    },
  }
}
