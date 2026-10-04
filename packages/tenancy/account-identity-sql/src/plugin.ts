import {
  AssemblyLifetimeService,
  startAssemblyWork,
} from '@omne-harness-lite/assembly-lifecycle/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { CredentialsService, AccountIdentityConfig } from '@omne-harness-lite/account-identity'
import { CREDENTIALS_SERVICE } from '@omne-harness-lite/account-identity/cordis'
import { definePlugin, resolveOptional } from '@omne-harness-lite/kernel-basis/cordis'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import { CLOCK_SERVICE } from '@omne-harness-lite/offer-expiry/cordis'
import type { AtomicStorage } from '@omne-harness-lite/storage'
import { STORAGE_SERVICE, type StorageService } from '@omne-harness-lite/storage/cordis'
import { AccountIdentityConfigSchema } from './config.ts'
import { createAccountIdentity } from './factory.ts'
import { loggerDiagnostics } from './diagnostics.ts'
import { contextNotifier } from './notifier.ts'
import { cryptoRandomSource } from './presentation.ts'
import { AccountsSqlService, LoginsSqlService } from './provided-services.ts'

function bind(
  ctx: Context,
  config: AccountIdentityConfig,
  own: (close: () => Promise<void>) => void,
): void {
  const storage = ctx.get(STORAGE_SERVICE) as StorageService & AtomicStorage
  if (typeof storage.atomic !== 'function')
    throw new Error('account-identity: explicit atomic storage is required')
  const diagnostics = loggerDiagnostics(ctx.logger('account-identity'))
  const instance = createAccountIdentity(config, {
    storage,
    clock: ctx.get(CLOCK_SERVICE) as Clock,
    resolveCredentials: () => resolveOptional<CredentialsService>(ctx, CREDENTIALS_SERVICE),
    notifier: contextNotifier(ctx, diagnostics),
    diagnostics,
    random: cryptoRandomSource,
  })
  own(() => instance.close())
  new AccountsSqlService(ctx, instance.accounts)
  new LoginsSqlService(ctx, instance.logins)
}

export const accountIdentityPlugin = definePlugin<AccountIdentityConfig>({
  name: 'account-identity-sql',
  inject: [STORAGE_SERVICE, CLOCK_SERVICE],
  Config: AccountIdentityConfigSchema,
  apply(ctx: Context, config) {
    bind(ctx, config, close => {
      ctx.effect(() => close)
    })
  },
})

export const managedAccountIdentityPlugin = Object.assign(
  definePlugin<AccountIdentityConfig>({
    name: 'account-identity-sql-managed',
    inject: [STORAGE_SERVICE, CLOCK_SERVICE, AssemblyLifetimeService.provide],
    Config: AccountIdentityConfigSchema,
    apply(ctx: Context, config) {
      let closeWork: (() => Promise<void>) | undefined
      startAssemblyWork(
        ctx,
        async () => {
          bind(ctx, config, close => {
            closeWork = close
          })
        },
        async () => {
          await closeWork?.()
        },
      )
    },
  }),
  { assemblyLifecycle: 1 as const },
)
