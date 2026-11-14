import type {
  AccountId,
  LoginStateId,
  OrganizationId,
  TenantId,
} from '@omne-harness/legal-identity'
import type { Duration, Instant } from '@omne-harness/utc-instant'

export type LoginCredentialInput = Readonly<{ loginIdentifier: string; credential: string }>

export type RegisterAndActivateInput = LoginCredentialInput

export type RegisterAndActivateOutcome =
  | Readonly<{
      kind: 'succeeded'
      account: AccountId
      organization: OrganizationId
      tenant: TenantId
    }>
  | Readonly<{ kind: 'not-loginable' }>

export type IssueLoginInput = LoginCredentialInput

export type IssuedLogin = Readonly<{
  login: LoginStateId
  account: AccountId
  loginIdentifier: string
  issuedAt: Instant
  maxDeadline: Instant
  idleDeadline: Instant
  tenant: TenantId
  loginProof: string
}>

export type IssueLoginOutcome =
  | (Readonly<{ kind: 'succeeded' }> & IssuedLogin)
  | Readonly<{ kind: 'uniform-auth-failure' }>
  | Readonly<{ kind: 'basis-unavailable'; diagnostic: string }>

export type RecognizeLoginInput = Readonly<{ loginProof: string }>

export type LoginRecognition =
  | Readonly<{ kind: 'recognized'; account: AccountId; login: LoginStateId; tenant: TenantId }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ kind: 'basis-unavailable'; diagnostic: string }>

export interface IdentityOperations {
  registerAndActivate(input: RegisterAndActivateInput): Promise<RegisterAndActivateOutcome>
  issueLogin(input: IssueLoginInput): Promise<IssueLoginOutcome>
  recognizeLogin(input: RecognizeLoginInput): Promise<LoginRecognition>
}

export type ClockReading =
  | Readonly<{ kind: 'read'; instant: Instant }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export interface IdentityClock {
  now(): Promise<ClockReading>
}

export type LoginTerms = Readonly<{ maxLifetime: Duration; idlePeriod: Duration }>

export type LoginTermsReading =
  | Readonly<{ kind: 'read'; terms: LoginTerms }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export interface LoginTermsSource {
  read(): Promise<LoginTermsReading>
}

export type IdentityOperationsOptions = Readonly<{
  clock: IdentityClock
  terms: LoginTermsSource
}>
