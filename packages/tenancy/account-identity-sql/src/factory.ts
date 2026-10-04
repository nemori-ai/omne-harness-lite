import type {
  AccountIdentityConfig,
  AccountsService,
  LoginsService,
} from '@omne-harness-lite/account-identity'
import { loadVerificationKey, unwrap } from '@omne-harness-lite/identity-values'
import { AccountsImpl } from './accounts.ts'
import { LoginsImpl } from './logins.ts'
import { AccountIdentityConfigSchema } from './config.ts'
import type { ServiceDeps } from './deps.ts'

export type AccountIdentityDependencies = Pick<
  ServiceDeps,
  'storage' | 'clock' | 'resolveCredentials' | 'notifier' | 'diagnostics' | 'random'
>

export class AccountIdentityStopped extends Error {
  override readonly name = 'AccountIdentityStopped'
  constructor() {
    super('Account identity instance is closed')
  }
}

export interface AccountIdentityInstance {
  readonly accounts: AccountsService
  readonly logins: LoginsService
  close(): Promise<void>
}

export function createAccountIdentity(
  config: AccountIdentityConfig,
  dependencies: AccountIdentityDependencies,
): AccountIdentityInstance {
  const parsed = AccountIdentityConfigSchema.parse(config)
  const deps: ServiceDeps = {
    ...dependencies,
    credentialPolicy: parsed.credentialPolicy,
    unactivatedRetention: parsed.unactivatedRetention,
    activationKey: unwrap(loadVerificationKey(parsed.activationVerificationKeyPem)),
    purgeKey: unwrap(loadVerificationKey(parsed.purgeVerificationKeyPem)),
  }
  const accounts = new AccountsImpl(deps)
  const logins = new LoginsImpl(deps)
  const inFlight = new Set<Promise<unknown>>()
  let stopped = false
  let closing: Promise<void> | undefined
  function run<T>(work: () => Promise<T>): Promise<T> {
    if (stopped) return Promise.reject(new AccountIdentityStopped())
    const result = work()
    inFlight.add(result)
    result.then(
      () => inFlight.delete(result),
      () => inFlight.delete(result),
    )
    return result
  }
  return {
    accounts: {
      participate: unit => accounts.participate(unit),
      produce: (...args) => run(() => accounts.produce(...args)),
      activate: (...args) => run(() => accounts.activate(...args)),
      read: (...args) => run(() => accounts.read(...args)),
      purge: (...args) => run(() => accounts.purge(...args)),
    },
    logins: {
      participate: unit => logins.participate(unit),
      prepareCredentialChange: (...args) => run(() => logins.prepareCredentialChange(...args)),
      changeCredential: (...args) => run(() => logins.changeCredential(...args)),
      issue: (...args) => run(() => logins.issue(...args)),
      exchange: (...args) => run(() => logins.exchange(...args)),
      revoke: (...args) => run(() => logins.revoke(...args)),
      verify: (...args) => run(() => logins.verify(...args)),
      listEffective: (...args) => run(() => logins.listEffective(...args)),
    },
    close() {
      if (closing) return closing
      stopped = true
      closing = Promise.allSettled([...inFlight]).then(() => {
        logins.clearPrepared()
      })
      return closing
    },
  }
}
