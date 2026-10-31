import type { AccountId, TenantId } from '@omne-harness/legal-identity'
import type { Instant } from '@omne-harness/utc-instant'
import type {
  IdentityClock,
  IdentityOperations,
  IdentityOperationsOptions,
  IssueLoginOutcome,
  LoginRecognition,
  LoginTermsSource,
  RegisterAndActivateOutcome,
} from '@omne-harness/identity'
import { inProcessIdentityOperations } from '@omne-harness/identity/testing'

declare const clock: IdentityClock
declare const terms: LoginTermsSource
declare const operations: IdentityOperations

// The provider has no default clock and no built-in terms.
// @ts-expect-error the clock is required
const _noClock: IdentityOperationsOptions = { terms }
// @ts-expect-error the terms are required
inProcessIdentityOperations({ clock })
const _provider: IdentityOperations = inProcessIdentityOperations({ clock, terms })

// Registration answers only the two kinds of the public protocol.
declare const registered: RegisterAndActivateOutcome
if (registered.kind === 'succeeded') {
  const _tenant: TenantId = registered.tenant
  const _account: AccountId = registered.account
} else {
  const _kind: 'not-loginable' = registered.kind
  // @ts-expect-error not-loginable tells nothing about the identifier
  const _absent = registered.account
}
// @ts-expect-error there is no taken-identifier kind
const _taken: RegisterAndActivateOutcome = { kind: 'identifier-taken' }

// The proof exists on success only; the failures carry no account and no proof.
declare const issued: IssueLoginOutcome
if (issued.kind === 'succeeded') {
  const _proof: string = issued.loginProof
  const _issuedAt: Instant = issued.issuedAt
  const _deadline: Instant = issued.idleDeadline
} else if (issued.kind === 'uniform-auth-failure') {
  // @ts-expect-error a uniform failure carries no reason
  const _reason = issued.reason
} else {
  const _diagnostic: string = issued.diagnostic
  // @ts-expect-error basis-unavailable carries no proof
  const _noProof = issued.loginProof
}
// @ts-expect-error an unknown account has no kind of its own
const _unknownAccount: IssueLoginOutcome = { kind: 'unknown-account' }

// Recognition names the account and the selection, never a principal of ID-16.
declare const recognition: LoginRecognition
if (recognition.kind === 'recognized') {
  const _selection: TenantId = recognition.tenant
  // @ts-expect-error recognition is not a principal
  const _principal = recognition.principal
}
// @ts-expect-error an invalid proof carries no detail
const _invalidDetail: LoginRecognition = { kind: 'invalid', reason: 'expired' }

// Every operation is asynchronous.
const _registering: Promise<RegisterAndActivateOutcome> = operations.registerAndActivate({
  loginIdentifier: 'ada',
  credential: 'secret',
})
// @ts-expect-error recognition takes a proof, not a login identity
operations.recognizeLogin({ login: 'lgn_x' })
