// Public entry of identity. Shapes and ports only, plus the in-process principal authority; the
// durable providers of accounts, logins and memberships are later members. The reference double of
// the account and login operations is in the `./testing` entry. SPEC.md owns the behavior that
// these types cannot express.
export { inProcessPrincipalAuthority, scopeOf } from './principal.ts'
export type {
  ActingForTenantPrincipal,
  IssueFailure,
  Principal,
  PrincipalAuthority,
  PrincipalIssuer,
  PrincipalVerification,
  PrincipalVerifier,
  SystemPrincipal,
  WorkRef,
} from './principal.ts'
export {
  DEFAULT_TEAM_MODEL,
  DEFAULT_TEAM_ROLES,
  DEFAULT_TEAM_ROLE_MAPPING,
  QUALIFICATIONS,
  governanceModelEquals,
  isQualification,
  qualificationsOf,
} from './qualification.ts'
export type {
  GovernanceModelRef,
  Qualification,
  RoleMapping,
  RoleQualifications,
  RoleRef,
  RoleResolutionFailure,
} from './qualification.ts'
export type { StandingEvidence, TenantStandingReading, TenantStandingSource } from './standing.ts'
export type {
  ClockReading,
  IdentityClock,
  IdentityOperations,
  IdentityOperationsOptions,
  IssuedLogin,
  IssueLoginInput,
  IssueLoginOutcome,
  LoginCredentialInput,
  LoginRecognition,
  LoginTerms,
  LoginTermsReading,
  LoginTermsSource,
  RecognizeLoginInput,
  RegisterAndActivateInput,
  RegisterAndActivateOutcome,
} from './operations.ts'
