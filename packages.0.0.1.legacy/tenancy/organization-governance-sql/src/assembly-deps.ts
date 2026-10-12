import type { AccountsService, LoginsService } from '@omne-harness-lite/account-identity'
import type { AtomicStorage } from '@omne-harness-lite/storage'
import type { PolicyDeps } from './policy-deps.ts'
export type AccountsReadFace = Pick<AccountsService, 'participate'>
export type LoginsVerifyFace = Pick<LoginsService, 'participate'>
export interface Deps extends Omit<PolicyDeps, 'persistence'> {
  readonly storage: AtomicStorage
  readonly accounts: AccountsReadFace
  readonly logins: LoginsVerifyFace
}
