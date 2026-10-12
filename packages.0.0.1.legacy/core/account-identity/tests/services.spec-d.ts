import { expectTypeOf, test } from 'vitest'
import type { AccountsService, LoginsService, CredentialsService } from '../src/index.ts'
import { Accounts, Logins, Credentials } from '../src/cordis.ts'

test('service definitions implement the exact pure operation faces', () => {
  expectTypeOf<Accounts>().toExtend<AccountsService>()
  expectTypeOf<Logins>().toExtend<LoginsService>()
  expectTypeOf<Credentials>().toExtend<CredentialsService>()
  expectTypeOf<Accounts['participate']>().toEqualTypeOf<AccountsService['participate']>()
  expectTypeOf<Logins['prepareCredentialChange']>().toEqualTypeOf<
    LoginsService['prepareCredentialChange']
  >()
  expectTypeOf(Credentials.provide).toEqualTypeOf<'credentials'>()
})
