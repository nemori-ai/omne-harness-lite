// The three operations that open an account and work with its logins (SPEC ID-17): register and
// activate, issue a login, and recognize a login proof. Shapes and ports only; a provider
// implements `IdentityOperations` with an injected clock and injected login terms. The in-process
// reference double and the contract suite live in the `./testing` entry.
import type {
  AccountId,
  LoginStateId,
  OrganizationId,
  TenantId,
} from '@omne-harness/legal-identity'
import type { Duration, Instant } from '@omne-harness/utc-instant'

/** What the caller gives to register or to log in. Both members must be non-empty text. */
export type LoginCredentialInput = Readonly<{ loginIdentifier: string; credential: string }>

export type RegisterAndActivateInput = LoginCredentialInput

/**
 * `succeeded`: the account, its one personal organization and its personal tenant exist together,
 * and the account can log in. `not-loginable` carries no detail: it does not tell whether the
 * identifier is taken or which provisioning condition failed.
 */
export type RegisterAndActivateOutcome =
  | Readonly<{
      kind: 'succeeded'
      account: AccountId
      organization: OrganizationId
      tenant: TenantId
    }>
  | Readonly<{ kind: 'not-loginable' }>

export type IssueLoginInput = LoginCredentialInput

/** One new, independent login. `loginProof` appears in this reply only. */
export type IssuedLogin = Readonly<{
  login: LoginStateId
  account: AccountId
  loginIdentifier: string
  issuedAt: Instant
  /** `issuedAt` plus the maximum lifetime read at issue. */
  maxDeadline: Instant
  /** `issuedAt` plus the idle period read at issue. */
  idleDeadline: Instant
  /** The current tenant selection; the personal tenant at first. */
  tenant: TenantId
  loginProof: string
}>

/**
 * `basis-unavailable` is decided before any credential comparison, so it never tells whether the
 * credential is right. An unknown account, an inactive account and a wrong credential all give the
 * same `uniform-auth-failure`.
 */
export type IssueLoginOutcome =
  | (Readonly<{ kind: 'succeeded' }> & IssuedLogin)
  | Readonly<{ kind: 'uniform-auth-failure' }>
  | Readonly<{ kind: 'basis-unavailable'; diagnostic: string }>

export type RecognizeLoginInput = Readonly<{ loginProof: string }>

/**
 * `recognized`: the login is valid now. `account` is its subject and `tenant` its current
 * selection; neither is a membership fact nor an authorization. `invalid` covers an empty, foreign
 * or unissued proof and an ended login alike. `basis-unavailable`: the validity of an issued login
 * cannot be judged now.
 */
export type LoginRecognition =
  | Readonly<{ kind: 'recognized'; account: AccountId; login: LoginStateId; tenant: TenantId }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ kind: 'basis-unavailable'; diagnostic: string }>

/** The operations port. No operation throws for a malformed input; it returns the outcome. */
export interface IdentityOperations {
  registerAndActivate(input: RegisterAndActivateInput): Promise<RegisterAndActivateOutcome>
  issueLogin(input: IssueLoginInput): Promise<IssueLoginOutcome>
  recognizeLogin(input: RecognizeLoginInput): Promise<LoginRecognition>
}

export type ClockReading =
  | Readonly<{ kind: 'read'; instant: Instant }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/** The injected time source of a provider. An unavailable time is not a fabricated reading. */
export interface IdentityClock {
  now(): Promise<ClockReading>
}

/** The two login lifetimes. Each must be greater than zero. */
export type LoginTerms = Readonly<{ maxLifetime: Duration; idlePeriod: Duration }>

export type LoginTermsReading =
  | Readonly<{ kind: 'read'; terms: LoginTerms }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/** The injected login terms configuration. A provider reads it at every issue. */
export interface LoginTermsSource {
  read(): Promise<LoginTermsReading>
}

/** What a provider is built with. There is no default clock and no built-in lifetime. */
export type IdentityOperationsOptions = Readonly<{
  clock: IdentityClock
  terms: LoginTermsSource
}>
