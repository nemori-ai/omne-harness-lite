import type { Context } from '@deepseek-ai/cordis'
import type { AtomicStorage, Storage } from '@omne-harness-lite/storage'
import type { AssemblyDeclaration } from '@omne-harness-lite/cordis-plugin-tree'
import {
  ASSEMBLY_LIFETIME_SERVICE,
  startAssemblyWork,
} from '@omne-harness-lite/assembly-lifecycle/cordis'
import { ENTRY_OPENING_SERVICE } from '@omne-harness-lite/governance-center-entry/cordis'
import {
  SERVING_EVENT,
  STOPPED_EVENT,
  DEFECT_EVENT,
  LISTENING_EVENT,
} from '@omne-harness-lite/governance-center-entry'
import {
  ORGANIZATIONS_SERVICE,
  MEMBERSHIPS_SERVICE,
  OFFERS_SERVICE,
} from '@omne-harness-lite/organization-governance/cordis'
import {
  ACCOUNTS_SERVICE,
  LOGINS_SERVICE,
  CREDENTIALS_SERVICE,
} from '@omne-harness-lite/account-identity/cordis'
import { REGISTRATION_SERVICE } from '@omne-harness-lite/account-registration/cordis'
import { STORAGE_SERVICE } from '@omne-harness-lite/storage/cordis'
import { CLOCK_SERVICE } from '@omne-harness-lite/offer-expiry/cordis'
import { definePlugin, fiberIsActive } from '@omne-harness-lite/kernel-basis/cordis'
import {
  GovernanceCenterEntryConfigSchema,
  type GovernanceCenterEntryConfig,
} from './entry-config.ts'
import { createGovernanceCenterEntry } from './entry.ts'
import type { GovernanceCenterEntryDependencies } from './entry-dependencies.ts'

function atomicStorage(storage: Storage): storage is AtomicStorage {
  return 'atomic' in storage && typeof storage.atomic === 'function'
}
function dependencies(ctx: Context, isCurrent: () => boolean): GovernanceCenterEntryDependencies {
  return {
    get storage() {
      const storage = ctx.storage
      if (!atomicStorage(storage)) throw new TypeError('entry2 requires AtomicStorage')
      return storage
    },
    get clock() {
      return ctx.clock
    },
    get services() {
      return {
        accounts: ctx.accounts,
        logins: ctx.logins,
        registration: ctx.registration,
        credentials: ctx.credentials,
        organizations: ctx.organizations,
        memberships: ctx.memberships,
        offers: ctx.offers,
      }
    },
    get opening() {
      return ctx.entryOpening
    },
    logger: ctx.logger('governance-center-entry'),
    notifications: {
      serving: notice => {
        ctx.emit(SERVING_EVENT, notice)
      },
      stopped: () => {
        ctx.emit(STOPPED_EVENT)
      },
      defect: () => {
        ctx.emit(DEFECT_EVENT)
      },
      onListening: listener => ctx.on(LISTENING_EVENT, listener),
    },
    isCurrent,
    isReadyToOpen: () => fiberIsActive(ctx),
  }
}
function describeEntryAssembly(value: unknown): AssemblyDeclaration {
  const config = GovernanceCenterEntryConfigSchema.parse(value)
  return {
    provides: [],
    requires: [
      STORAGE_SERVICE,
      CLOCK_SERVICE,
      CREDENTIALS_SERVICE,
      LOGINS_SERVICE,
      ACCOUNTS_SERVICE,
      REGISTRATION_SERVICE,
      ORGANIZATIONS_SERVICE,
      MEMBERSHIPS_SERVICE,
      OFFERS_SERVICE,
      ENTRY_OPENING_SERVICE,
    ],
    optional: [],
    dynamicProvides: [],
    dynamicRequires: [],
    claims: [
      {
        name: 'tenancy-host/entry',
        version: 1,
        config: {
          listen: { ...config.listen },
          tls: { ...config.tls },
          version: config.version,
          drainTimeoutMs: config.drainTimeoutMs,
          clockReadyTimeoutMs: config.clockReadyTimeoutMs,
        },
      },
    ],
  }
}

export const governanceCenterEntryPlugin = definePlugin<GovernanceCenterEntryConfig>({
  name: 'governance-center-entry-node',
  inject: [
    STORAGE_SERVICE,
    CLOCK_SERVICE,
    CREDENTIALS_SERVICE,
    LOGINS_SERVICE,
    ACCOUNTS_SERVICE,
    REGISTRATION_SERVICE,
    ORGANIZATIONS_SERVICE,
    MEMBERSHIPS_SERVICE,
    OFFERS_SERVICE,
    ENTRY_OPENING_SERVICE,
  ],
  Config: GovernanceCenterEntryConfigSchema,
  async apply(ctx: Context, config) {
    const work = createGovernanceCenterEntry(
      config,
      dependencies(ctx, () => ctx.fiber.uid !== null),
    )
    ctx.effect(() => work.close, 'governance-center-entry listener')
    await work.setup()
  },
})
export const managedGovernanceCenterEntryPlugin = Object.assign(
  definePlugin<GovernanceCenterEntryConfig>({
    name: 'governance-center-entry-node-managed',
    inject: [
      STORAGE_SERVICE,
      CLOCK_SERVICE,
      CREDENTIALS_SERVICE,
      LOGINS_SERVICE,
      ACCOUNTS_SERVICE,
      REGISTRATION_SERVICE,
      ORGANIZATIONS_SERVICE,
      MEMBERSHIPS_SERVICE,
      OFFERS_SERVICE,
      ENTRY_OPENING_SERVICE,
      ASSEMBLY_LIFETIME_SERVICE,
    ],
    Config: GovernanceCenterEntryConfigSchema,
    apply(ctx: Context, config) {
      const work = createGovernanceCenterEntry(
        config,
        dependencies(ctx, () => ctx.fiber.uid !== null && ctx.assemblyLifetime.isCurrent()),
      )
      startAssemblyWork(ctx, work.setup, work.close)
    },
  }),
  { assemblyLifecycle: 1 as const, describeAssembly: describeEntryAssembly },
)
