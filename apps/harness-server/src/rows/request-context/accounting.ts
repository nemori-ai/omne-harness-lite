// The accounting ports of the `request-context` row (B1, R2-D136; SC2). They are runtime objects of
// trusted assembly code, not configuration.
//
// - Source authority: a narrow allow fixed by the release (SC2). It admits one sender only, the
//   adoption that the `agent-account-outlet` row is configured with, and only for a verified
//   principal whose tenant is the tenant of the access, the target and the call. Every other input
//   is `denied`; the reason goes to the diagnostic hook, because the contract's `denied` carries no
//   text. It does not check that the account and its evidence are one committed log fact, nor that
//   the caller is the outlet itself: the release has no source for either (residual of
//   B1-GAP-ACCOUNTING-SOURCE-AUTHORITY, see `docs/rows/session-run-release.md`).
// - Read eligibility: the `eligibility` part of the holder sources that are already registered
//   (`contextHolderSources`, row `session-ad04`), read per call under a short lease. Only the
//   `accounts` operation is admitted.
// - Adopted source and recovery authority stay named gaps; they answer `unavailable`.
import { tenantEquals } from '@omne-harness/legal-identity'
import type {
  AccountingOptions,
  AccountingSourceAuthority,
  Adoption,
  AdoptedRequestSource,
  ContextReadEligibility,
  PrincipalBinding,
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
  principal: 'accounting source: the principal of the access is not verified for its tenant',
  tenant: 'accounting source: the tenants of the access, the target and the call differ',
  sender: 'accounting source: the sender is not the configured agent-account-outlet adoption',
  operation: 'accounting read eligibility: only the accounts operation is admitted',
  eligibility: 'accounting read eligibility: the holder eligibility denied the access',
})

export type AccountingDiagnose = (diagnostic: string) => void

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
  /** The principal binding of the trusted `requestContextTrust`: it verifies the principal. */
  principalBinding: PrincipalBinding<unknown>
  sender: Adoption
  diagnose: AccountingDiagnose
}>

/**
 * The narrow source authority. Order: the principal (an unavailable verifier stays unavailable,
 * never `denied`), then the three tenants, then producer and sender. The first that fails answers.
 */
export function createOutletSourceAuthority(
  options: OutletSourceAuthorityOptions,
): AccountingSourceAuthority<unknown> {
  const deny = (diagnostic: string) => {
    options.diagnose(diagnostic)
    return DENIED
  }
  const check: AccountingSourceAuthority<unknown>['check'] = async ({ access, input }) => {
    let key: Awaited<ReturnType<PrincipalBinding<unknown>['key']>>
    try {
      key = await options.principalBinding.key(access)
    } catch {
      return unavailable('accounting source: the principal binding threw; its message is not reported')
    }
    if (key.kind === 'unavailable')
      return unavailable(`accounting source: principal binding: ${key.diagnostic}`)
    if (key.kind === 'unknown') return { kind: 'unknown' }
    if (key.kind !== 'value') return deny(ACCOUNTING_DENIALS.principal)
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
      options.diagnose(ACCOUNTING_DENIALS.operation)
      return DENIED
    }
    let holder: ContextHolderSources<unknown> | undefined
    try {
      holder = options.readHolder()
    } catch {
      holder = undefined
    }
    if (holder === undefined)
      return unavailable('accounting read eligibility: no contextHolderSources holder is running')
    let leased: ReturnType<ContextHolderSources<unknown>['lease']>
    try {
      leased = holder.lease({ settle: () => Promise.resolve(SETTLED) })
    } catch {
      return unavailable('accounting read eligibility: the holder lease threw')
    }
    if (leased.kind !== 'leased')
      return unavailable(`accounting read eligibility: holder lease: ${leased.diagnostic}`)
    try {
      const answer = await leased.lease.parts.eligibility.check(input)
      if (answer.kind === 'denied') options.diagnose(ACCOUNTING_DENIALS.eligibility)
      return answer
    } catch {
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
  principalBinding: PrincipalBinding<unknown>
  readHolder: HolderReadEligibilityOptions['readHolder']
  diagnose: AccountingDiagnose
}>

/** The accounting options of the release: the two narrow ports, the two gaps and the limits. */
export function releaseAccounting(
  limits: AccountingOptions<unknown>['limits'],
  ports: ReleaseAccountingPorts,
): AccountingOptions<unknown> {
  return {
    sourceAuthority: createOutletSourceAuthority({
      principalBinding: ports.principalBinding,
      sender: ACCOUNT_OUTLET_SENDER,
      diagnose: ports.diagnose,
    }),
    readEligibility: createHolderReadEligibility({
      readHolder: ports.readHolder,
      diagnose: ports.diagnose,
    }),
    adoptedSource: gapAdoptedSource,
    recoveryAuthority: gapRecoveryAuthority,
    limits,
  }
}
