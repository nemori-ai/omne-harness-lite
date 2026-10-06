import type {
  AccountIdentityConfig,
  AccountsService,
  LoginsService,
} from '@omne-harness-lite/account-identity'
import { loadVerificationKey, unwrap } from '@omne-harness-lite/identity-values'
import { AccountsImpl } from './accounts.ts'
import { LoginsImpl } from './logins.ts'
import { AccountIdentityConfigSchema } from './config.ts'
import type { PolicyDeps, ServiceDeps } from './deps.ts'
import { createIdentityPersistence } from './identity-sql.ts'

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

/** Internal assembly shared with fault fixtures; not exported by the package root. */
export function assembleIdentityServices(dependencies: ServiceDeps): {
  readonly accounts: AccountsService
  readonly logins: LoginsService
  clearPrepared(): void
} {
  const { persistence, bindUnit } = createIdentityPersistence(dependencies.storage)
  const policy: PolicyDeps = {
    persistence,
    clock: dependencies.clock,
    resolveCredentials: dependencies.resolveCredentials,
    credentialPolicy: dependencies.credentialPolicy,
    unactivatedRetention: dependencies.unactivatedRetention,
    activationKey: dependencies.activationKey,
    purgeKey: dependencies.purgeKey,
    notifier: dependencies.notifier,
    diagnostics: dependencies.diagnostics,
    random: dependencies.random,
  }
  const accounts = new AccountsImpl(policy)
  const logins = new LoginsImpl(policy)
  return {
    accounts: {
      participate: unit => accounts.participate(bindUnit(unit)),
      produce: (...args) => accounts.produce(...args),
      activate: (...args) => accounts.activate(...args),
      read: (...args) => accounts.read(...args),
      purge: (...args) => accounts.purge(...args),
    },
    logins: {
      participate: unit => logins.participate(bindUnit(unit)),
      prepareCredentialChange: (...args) => logins.prepareCredentialChange(...args),
      changeCredential: (...args) => logins.changeCredential(...args),
      issue: (...args) => logins.issue(...args),
      exchange: (...args) => logins.exchange(...args),
      revoke: (...args) => logins.revoke(...args),
      verify: (...args) => logins.verify(...args),
      listEffective: (...args) => logins.listEffective(...args),
    },
    clearPrepared: () => logins.clearPrepared(),
  }
}

export function createAccountIdentity(
  config: AccountIdentityConfig,
  dependencies: AccountIdentityDependencies,
): AccountIdentityInstance {
  const parsed = AccountIdentityConfigSchema.parse(config)
  const deps: ServiceDeps = {
    storage: dependencies.storage,
    clock: dependencies.clock,
    resolveCredentials: dependencies.resolveCredentials,
    notifier: dependencies.notifier,
    diagnostics: dependencies.diagnostics,
    random: dependencies.random,
    credentialPolicy: parsed.credentialPolicy,
    unactivatedRetention: parsed.unactivatedRetention,
    activationKey: unwrap(loadVerificationKey(parsed.activationVerificationKeyPem)),
    purgeKey: unwrap(loadVerificationKey(parsed.purgeVerificationKeyPem)),
  }
  const { accounts, logins, clearPrepared } = assembleIdentityServices(deps)
  const inFlight = new Set<Promise<unknown>>()
  let stopped = false
  let closing: Promise<void> | undefined
  function run<T>(work: () => Promise<T>): Promise<T> {
    if (stopped) return Promise.reject(new AccountIdentityStopped())
    const { promise: result, resolve, reject } = Promise.withResolvers<T>()
    inFlight.add(result)
    result.then(
      () => inFlight.delete(result),
      () => inFlight.delete(result),
    )
    try {
      resolve(work())
    } catch (error) {
      reject(error)
    }
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
        clearPrepared()
      })
      return closing
    },
  }
}
