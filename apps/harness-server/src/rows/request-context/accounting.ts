// The accounting ports of the `request-context` row that the release has no production source for
// yet (B1, R2-D136). Each one is a named gap and answers `unavailable` with a diagnostic that names
// it: the accounting inbox then refuses what it cannot vouch for, and nothing is let through by
// default. They are runtime objects of trusted assembly code, not configuration.
import type {
  AccountingOptions,
  AccountingSourceAuthority,
  AdoptedRequestSource,
  ContextReadEligibility,
  RecoveryAuthority,
} from '@omne-harness/request-context-contract'

/** The gaps, by name. A production source for one of them replaces the entry here. */
export const ACCOUNTING_GAPS = Object.freeze({
  sourceAuthority:
    'B1-GAP-ACCOUNTING-SOURCE-AUTHORITY: the release has no authority that admits received account facts',
  readEligibility:
    'B1-GAP-ACCOUNTING-READ-ELIGIBILITY: the release has no read eligibility for the accounting inbox',
  adoptedSource:
    'B1-GAP-ADOPTED-REQUEST-SOURCE: the release has no source of the fixed request facts of the coordinator (CX-08)',
  recoveryAuthority:
    'B1-GAP-ACCOUNTING-RECOVERY-AUTHORITY: the release has no authority for rebuilding accounts',
})

const unavailable = (diagnostic: string) => ({ kind: 'unavailable' as const, diagnostic })

export const gapSourceAuthority: AccountingSourceAuthority<unknown> = Object.freeze({
  check: async () => unavailable(ACCOUNTING_GAPS.sourceAuthority),
})

export const gapReadEligibility: ContextReadEligibility<unknown> = Object.freeze({
  check: async () => unavailable(ACCOUNTING_GAPS.readEligibility),
})

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

/** The accounting options of the release: the gap ports and the limits the operator layer gives. */
export function releaseAccounting(
  limits: AccountingOptions<unknown>['limits'],
): AccountingOptions<unknown> {
  return {
    sourceAuthority: gapSourceAuthority,
    readEligibility: gapReadEligibility,
    adoptedSource: gapAdoptedSource,
    recoveryAuthority: gapRecoveryAuthority,
    limits,
  }
}
