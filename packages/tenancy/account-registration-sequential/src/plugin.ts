import {
  ASSEMBLY_LIFETIME_SERVICE,
  startAssemblyWork,
} from '@omne-harness-lite/assembly-lifecycle/cordis'
import type { Context } from '@deepseek-ai/cordis'
import { ACCOUNTS_SERVICE } from '@omne-harness-lite/account-identity/cordis'
import { loadSigningKey, unwrap } from '@omne-harness-lite/identity-values'
import type { AccountRegistrationConfig } from '@omne-harness-lite/account-registration'
import { definePlugin, fiberIsActive } from '@omne-harness-lite/kernel-basis/cordis'
import {
  ORGANIZATIONS_SERVICE,
  ORGANIZATION_PURGE_SERVICE,
} from '@omne-harness-lite/organization-governance/cordis'
import { AccountRegistrationConfigSchema } from './config.ts'
import { createRegistrationService } from './registration.ts'
import { SequentialRegistration } from './provided-services.ts'
import type { AssemblyDeclaration } from '@omne-harness-lite/cordis-plugin-tree'
import { REGISTRATION_SERVICE } from '@omne-harness-lite/account-registration/cordis'

function describeAssembly(value: unknown): AssemblyDeclaration {
  const config = AccountRegistrationConfigSchema.parse(value)
  return {
    provides: [REGISTRATION_SERVICE],
    requires: [ACCOUNTS_SERVICE, ORGANIZATIONS_SERVICE, ORGANIZATION_PURGE_SERVICE],
    optional: [],
    dynamicProvides: [],
    dynamicRequires: [],
    claims: [
      {
        name: 'tenancy-host/registration',
        version: 1,
        config: { activationSigningKeyPem: config.activationSigningKeyPem },
      },
    ],
  }
}

function bind(
  ctx: Context,
  config: AccountRegistrationConfig,
  own: (close: () => Promise<void>) => void,
  current: () => boolean = () => true,
): void {
  const logger = ctx.logger('account-registration')
  const instance = createRegistrationService({
    accounts: ctx.accounts,
    organizations: ctx.organizations,
    organizationPurge: ctx.organizationPurge,
    activationKey: unwrap(loadSigningKey(config.activationSigningKeyPem)),
    isActive: () => fiberIsActive(ctx) && current(),
    recordDefect: record => logger.error('registration defect: %o', record),
  })
  own(() => instance.close())
  new SequentialRegistration(ctx, instance)
}

export const registrationPlugin = definePlugin<AccountRegistrationConfig>({
  name: 'account-registration-sequential',
  inject: [ACCOUNTS_SERVICE, ORGANIZATIONS_SERVICE, ORGANIZATION_PURGE_SERVICE],
  Config: AccountRegistrationConfigSchema,
  apply(ctx: Context, config) {
    bind(ctx, config, close => {
      ctx.effect(() => close)
    })
  },
})

export const managedRegistrationPlugin = Object.assign(
  definePlugin<AccountRegistrationConfig>({
    name: 'account-registration-sequential-managed',
    inject: [
      ACCOUNTS_SERVICE,
      ORGANIZATIONS_SERVICE,
      ORGANIZATION_PURGE_SERVICE,
      ASSEMBLY_LIFETIME_SERVICE,
    ],
    Config: AccountRegistrationConfigSchema,
    apply(ctx: Context, config) {
      const lifetime = ctx.assemblyLifetime
      let closeWork: (() => Promise<void>) | undefined
      startAssemblyWork(
        ctx,
        async () => {
          bind(
            ctx,
            config,
            close => {
              closeWork = close
            },
            () => lifetime.isCurrent(),
          )
        },
        async () => {
          await closeWork?.()
        },
      )
    },
  }),
  { assemblyLifecycle: 1 as const, describeAssembly },
)
