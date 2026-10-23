// The report of one successful business access on one login (SPEC ID-03, ID-16). Only this report
// refreshes the idle timer of that login. The caller names the login and the operation; the
// instant comes from identity's trusted clock at receipt, not from the caller.
import type { LoginStateId } from '@omne-harness/legal-identity'

export type BusinessAccessReport = Readonly<{
  login: LoginStateId
  operation: Readonly<{ owner: string; name: string }>
}>

export type BusinessAccessReportOutcome =
  | Readonly<{ kind: 'refreshed' }>
  /** The login is not valid now. Expired, revoked and unknown logins all say this. */
  | Readonly<{ kind: 'login-invalid' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export interface LoginActivityReporter {
  report(input: BusinessAccessReport): Promise<BusinessAccessReportOutcome>
}
