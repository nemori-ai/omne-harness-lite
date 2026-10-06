import type { Context } from '@deepseek-ai/cordis'
import { Accounts } from '@omne-harness-lite/account-identity/cordis'
import type { AccountsService } from '@omne-harness-lite/account-identity'
import { Logins } from '@omne-harness-lite/account-identity/cordis'
import type { LoginsService } from '@omne-harness-lite/account-identity'

export class AccountsSqlService extends Accounts {
  readonly participate: AccountsService['participate']
  readonly produce: AccountsService['produce']
  readonly activate: AccountsService['activate']
  readonly read: AccountsService['read']
  readonly purge: AccountsService['purge']
  constructor(ctx: Context, implementation: AccountsService) {
    super(ctx)
    this.participate = implementation.participate.bind(implementation)
    this.produce = implementation.produce.bind(implementation)
    this.activate = implementation.activate.bind(implementation)
    this.read = implementation.read.bind(implementation)
    this.purge = implementation.purge.bind(implementation)
  }
}

export class LoginsSqlService extends Logins {
  readonly participate: LoginsService['participate']
  readonly prepareCredentialChange: LoginsService['prepareCredentialChange']
  readonly changeCredential: LoginsService['changeCredential']
  readonly issue: LoginsService['issue']
  readonly exchange: LoginsService['exchange']
  readonly revoke: LoginsService['revoke']
  readonly verify: LoginsService['verify']
  readonly listEffective: LoginsService['listEffective']
  constructor(ctx: Context, implementation: LoginsService) {
    super(ctx)
    this.participate = implementation.participate.bind(implementation)
    this.prepareCredentialChange = implementation.prepareCredentialChange.bind(implementation)
    this.changeCredential = implementation.changeCredential.bind(implementation)
    this.issue = implementation.issue.bind(implementation)
    this.exchange = implementation.exchange.bind(implementation)
    this.revoke = implementation.revoke.bind(implementation)
    this.verify = implementation.verify.bind(implementation)
    this.listEffective = implementation.listEffective.bind(implementation)
  }
}
