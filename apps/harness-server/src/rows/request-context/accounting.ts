// The accounting ports of the `request-context` row (B1, R2-D136; SC2). They are runtime objects of
// trusted assembly code, not configuration.
//
// - Source authority: a narrow allow fixed by the release (SC2). It admits one sender only, the
//   adoption that the `agent-account-outlet` row is configured with, and only for a verified
//   acting-for-tenant principal whose tenant is the tenant of the access, the target and the call.
//   A system principal is `denied`: the system scope stands for no tenant (IC-18). Every other
//   input is `denied`; the reason goes to the diagnostic hook, because the contract's `denied`
//   carries no text. The verifier is the `principalVerifier` service, read per call. It does not check that the account and its evidence are one committed log fact, nor that
//   the caller is the outlet itself: the release has no source for either (residual of
//   B1-GAP-ACCOUNTING-SOURCE-AUTHORITY, see `docs/rows/session-run-release.md`).
// - Read eligibility: the `eligibility` part of the holder sources that are already registered
//   (`contextHolderSources`, row `session-ad04`), read per call under a short lease. Only the
//   `accounts` operation is admitted.
// - Adopted source and recovery authority stay named gaps; they answer `unavailable`.
import type { PrincipalVerification, PrincipalVerifier } from '@omne-harness/identity'
import { tenantEquals } from '@omne-harness/legal-identity'
import type {
  AccountingOptions,
  AccountingSourceAuthority,
  Adoption,
  AdoptedRequestSource,
  ContextReadEligibility,
  RecoveryAuthority,
  SourceDecision,
} from '@omne-harness/request-context-contract'
import type { ContextHolderSources } from '@omne-harness/request-context-cordis-contract'

/** The gaps that stay, by name. A production source for one of them replaces the entry here. */
export const ACCOUNTING_GAPS = Object.freeze({
  adoptedSource:
    'B1-GAP-ADOPTED-REQUEST-SOURCE: the release has no source of the fixed request facts of the coordinator (CX-08)',
  recoveryAuthority:
    'B1-GAP-ACCOUNTING-RECOVERY-AUTHORITY: the release has no authority for rebuilding accounts',
})

/**
 * The sender the source authority admits: the adoption identity the `agent-account-outlet` row is
 * configured with in the release (`config/serve.distribution.json`). A test keeps the two equal; an
 * operator layer that gives that row another sender makes every account `denied`.
 */
export const ACCOUNT_OUTLET_SENDER: Adoption = Object.freeze({
  owner: '@omne-harness/agent-context',
  name: 'account-outlet',
  revision: '1',
  digest: 'agent-context:account-outlet/1',
})

/** Why a port answered `denied`. The text names no tenant, principal or account. */
export const ACCOUNTING_DENIALS = Object.freeze({
  principal: 'accounting source: the principal of the access is not verified',
  system:
    'accounting source: the principal is not an acting-for-tenant principal of the access tenant',
  tenant: 'accounting source: the tenants of the access, the target and the call differ',
  sender: 'accounting source: the sender is not the configured agent-account-outlet adoption',
  operation: 'accounting read eligibility: only the accounts operation is admitted',
  eligibility: 'accounting read eligibility: the holder eligibility denied the access',
})

export type AccountingDiagnose = (diagnostic: string) => void

/** Swallowed failures and routine refusals: debug level, never part of an answer. */
export type AccountingTrace = (diagnostic: string) => void

const DENIED = Object.freeze({ kind: 'denied' as const })
const ALLOWED: SourceDecision = Object.freeze({ kind: 'allowed' })
const unavailable = (diagnostic: string) => ({ kind: 'unavailable' as const, diagnostic })

function sameAdoption(left: Adoption, right: Adoption): boolean {
  return (
    left.owner === right.owner &&
    left.name === right.name &&
    left.revision === right.revision &&
    left.digest === right.digest
  )
}

export type OutletSourceAuthorityOptions = Readonly<{
  /** Reads the principal verifier now; `undefined` when none is running. */
  readVerifier: () => PrincipalVerifier | undefined
  sender: Adoption
  diagnose: AccountingDiagnose
  trace: AccountingTrace
}>

/**
 * The narrow source authority. Order: the principal (an absent, unavailable or throwing verifier
 * stays unavailable, never `denied`; only an acting-for-tenant principal of the access tenant
 * passes), then the three tenants, then producer and sender. The first that fails answers.
 */
export function createOutletSourceAuthority(
  options: OutletSourceAuthorityOptions,
): AccountingSourceAuthority<unknown> {
  const deny = (diagnostic: string) => {
    options.diagnose(diagnostic)
    return DENIED
  }
  const check: AccountingSourceAuthority<unknown>['check'] = async ({ access, input }) => {
    let verification: PrincipalVerification
    try {
      const verifier = options.readVerifier()
      if (verifier === undefined)
        return unavailable('accounting source: no principalVerifier is running')
      verification = await verifier.verify(access.principal)
    } catch {
      options.trace('accounting source: the principal verifier threw')
      return unavailable(
        'accounting source: the principal verifier threw; its message is not reported',
      )
    }
    if (verification.kind === 'unavailable')
      return unavailable(`accounting source: principal verifier: ${verification.diagnostic}`)
    if (verification.kind !== 'verified') return deny(ACCOUNTING_DENIALS.principal)
    const principal = verification.principal
    if (principal.kind !== 'acting-for-tenant' || !tenantEquals(principal.tenant, access.tenant))
      return deny(ACCOUNTING_DENIALS.system)
    if (
      !tenantEquals(access.tenant, input.target.tenant) ||
      !tenantEquals(access.tenant, input.call.tenant)
    )
      return deny(ACCOUNTING_DENIALS.tenant)
    if (input.origin.producer !== 'model' || !sameAdoption(input.origin.sender, options.sender))
      return deny(ACCOUNTING_DENIALS.sender)
    return ALLOWED
  }
  return Object.freeze({ check })
}

export type HolderReadEligibilityOptions = Readonly<{
  /** Reads the registered holder sources now; `undefined` when no holder is running. */
  readHolder: () => ContextHolderSources<unknown> | undefined
  diagnose: AccountingDiagnose
  trace: AccountingTrace
}>

const SETTLED = Object.freeze({ kind: 'settled' as const })

/**
 * The read eligibility of the accounting inbox: the `eligibility` part of the registered holder
 * sources. Each check takes a lease and ends it before it returns; this port registers no source
 * set with the parts, so the settlement is immediate. No holder, a refused lease or a throw is
 * `unavailable`; a `denied` of the holder stays `denied`.
 */
export function createHolderReadEligibility(
  options: HolderReadEligibilityOptions,
): ContextReadEligibility<unknown> {
  const check: ContextReadEligibility<unknown>['check'] = async input => {
    if (input.operation !== 'accounts') {
      options.trace(ACCOUNTING_DENIALS.operation)
      return DENIED
    }
    let holder: ContextHolderSources<unknown> | undefined
    try {
      holder = options.readHolder()
    } catch {
      options.trace('accounting read eligibility: reading the holder threw')
      holder = undefined
    }
    if (holder === undefined)
      return unavailable('accounting read eligibility: no contextHolderSources holder is running')
    let leased: ReturnType<ContextHolderSources<unknown>['lease']>
    try {
      leased = holder.lease({ settle: () => Promise.resolve(SETTLED) })
    } catch {
      options.trace('accounting read eligibility: the holder lease threw')
      return unavailable('accounting read eligibility: the holder lease threw')
    }
    if (leased.kind !== 'leased')
      return unavailable(`accounting read eligibility: holder lease: ${leased.diagnostic}`)
    try {
      const answer = await leased.lease.parts.eligibility.check(input)
      if (answer.kind === 'denied') options.diagnose(ACCOUNTING_DENIALS.eligibility)
      return answer
    } catch {
      options.trace('accounting read eligibility: the holder eligibility threw')
      return unavailable('accounting read eligibility: the holder eligibility threw')
    } finally {
      leased.lease.release()
    }
  }
  return Object.freeze({ check })
}

export const gapAdoptedSource: AdoptedRequestSource<unknown> = Object.freeze({
  authority: {
    owner: '@omne-harness/harness-server',
    name: 'request-context/adopted-absent',
    revision: '1',
    digest: 'harness-server:request-context/adopted-absent/1',
  },
  readCount: async () => unavailable(ACCOUNTING_GAPS.adoptedSource),
  readSource: async () => unavailable(ACCOUNTING_GAPS.adoptedSource),
})

export const gapRecoveryAuthority: RecoveryAuthority<unknown> = Object.freeze({
  check: async () => unavailable(ACCOUNTING_GAPS.recoveryAuthority),
  checkFact: async () => unavailable(ACCOUNTING_GAPS.recoveryAuthority),
})

export type ReleaseAccountingPorts = Readonly<{
  readVerifier: OutletSourceAuthorityOptions['readVerifier']
  readHolder: HolderReadEligibilityOptions['readHolder']
  diagnose: AccountingDiagnose
  trace: AccountingTrace
}>

/** The accounting options of the release: the two narrow ports, the two gaps and the limits. */
export function releaseAccounting(
  limits: AccountingOptions<unknown>['limits'],
  ports: ReleaseAccountingPorts,
): AccountingOptions<unknown> {
  return {
    sourceAuthority: createOutletSourceAuthority({
      readVerifier: ports.readVerifier,
      sender: ACCOUNT_OUTLET_SENDER,
      diagnose: ports.diagnose,
      trace: ports.trace,
    }),
    readEligibility: createHolderReadEligibility({
      readHolder: ports.readHolder,
      diagnose: ports.diagnose,
      trace: ports.trace,
    }),
    adoptedSource: gapAdoptedSource,
    recoveryAuthority: gapRecoveryAuthority,
    limits,
  }
}
