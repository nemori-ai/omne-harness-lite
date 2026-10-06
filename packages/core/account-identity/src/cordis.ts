import { Service, type Context } from '@deepseek-ai/cordis'
import type {
  AccountsService,
  LoginsService,
  CredentialsService,
  AccountIdentityEvents,
} from './index.ts'

/** @contract capability.account-identity */
export abstract class Accounts extends Service implements AccountsService {
  static readonly provide = 'accounts' as const
  constructor(ctx: Context) {
    super(ctx, Accounts.provide)
  }
  abstract participate: AccountsService['participate']
  abstract produce: AccountsService['produce']
  abstract activate: AccountsService['activate']
  abstract read: AccountsService['read']
  abstract purge: AccountsService['purge']
}

export const ACCOUNTS_SERVICE = Accounts.provide

/** @contract capability.account-identity */
export abstract class Logins extends Service implements LoginsService {
  static readonly provide = 'logins' as const
  constructor(ctx: Context) {
    super(ctx, Logins.provide)
  }
  abstract participate: LoginsService['participate']
  abstract prepareCredentialChange: LoginsService['prepareCredentialChange']
  abstract changeCredential: LoginsService['changeCredential']
  abstract issue: LoginsService['issue']
  abstract exchange: LoginsService['exchange']
  abstract revoke: LoginsService['revoke']
  abstract verify: LoginsService['verify']
  abstract listEffective: LoginsService['listEffective']
}

export const LOGINS_SERVICE = Logins.provide

/** @contract capability.account-identity */
export abstract class Credentials extends Service implements CredentialsService {
  static readonly provide = 'credentials' as const
  constructor(ctx: Context) {
    super(ctx, Credentials.provide)
  }
  abstract parse: CredentialsService['parse']
  abstract derive: CredentialsService['derive']
  abstract verify: CredentialsService['verify']
  abstract checkPolicy: CredentialsService['checkPolicy']
}

export const CREDENTIALS_SERVICE = Credentials.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    accounts: Accounts
    logins: Logins
    credentials: Credentials
  }
  interface Events {
    /** @mode emit
     * @param payload Committed identity notification.
     */
    'account-identity/account-activated': AccountIdentityEvents['account-identity/account-activated']
    /** @mode emit
     * @param payload Committed identity notification.
     */
    'account-identity/login-revoked': AccountIdentityEvents['account-identity/login-revoked']
    /** @mode emit
     * @param payload Committed identity notification.
     */
    'account-identity/account-expired': AccountIdentityEvents['account-identity/account-expired']
  }
}
