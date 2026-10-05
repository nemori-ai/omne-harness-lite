import {
  ASSEMBLY_LIFETIME_SERVICE,
  startAssemblyWork,
} from '@omne-harness-lite/assembly-lifecycle/cordis'
import { createOrganizationGovernance } from './factory.ts'
import { STORAGE_SERVICE, type StorageService } from '@omne-harness-lite/storage/cordis'
import { CLOCK_SERVICE } from '@omne-harness-lite/offer-expiry/cordis'
// 一个插件、一条 fiber；四个 Service 定义由公共包拥有。行为与装卸承诺见 SPEC.md。
import type { Context } from '@deepseek-ai/cordis'
import type { z } from 'zod'
import { OrganizationGovernanceConfigSchema } from './config.ts'
import { ACCOUNTS_SERVICE, LOGINS_SERVICE } from '@omne-harness-lite/account-identity/cordis'
import { loadSigningKey, unwrap } from '@omne-harness-lite/identity-values'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import { StorageDefect, type AtomicStorage } from '@omne-harness-lite/storage'
import type { AccountsReadFace, Deps, LoginsVerifyFace } from './assembly-deps.ts'
import type { ResolvedConfig } from './policy-deps.ts'
import type { OrganizationGovernanceEvents } from '@omne-harness-lite/organization-governance'
import type { AssemblyDeclaration } from '@omne-harness-lite/cordis-plugin-tree'
import {
  ORGANIZATIONS_SERVICE,
  MEMBERSHIPS_SERVICE,
  OFFERS_SERVICE,
  ORGANIZATION_PURGE_SERVICE,
} from '@omne-harness-lite/organization-governance/cordis'
import {
  OrganizationsSqlService,
  MembershipsSqlService,
  OffersSqlService,
  OrganizationPurgeSqlService,
} from './provided-services.ts'

type ParsedConfig = z.output<typeof OrganizationGovernanceConfigSchema>

function describeAssembly(value: unknown): AssemblyDeclaration {
  const config = OrganizationGovernanceConfigSchema.parse(value)
  return {
    provides: [
      ORGANIZATIONS_SERVICE,
      MEMBERSHIPS_SERVICE,
      OFFERS_SERVICE,
      ORGANIZATION_PURGE_SERVICE,
    ],
    requires: [STORAGE_SERVICE, CLOCK_SERVICE, ACCOUNTS_SERVICE, LOGINS_SERVICE],
    optional: [],
    claims: [{ name: 'tenancy-host/organizations', version: 1, config }],
  }
}

function bind(ctx: Context, config: ParsedConfig, own: (close: () => Promise<void>) => void): void {
  const resolved: ResolvedConfig = {
    invitationTtlDefault: config.invitationTtlDefault,
    affiliationRequestTtlDefault: config.affiliationRequestTtlDefault,
    teamCreationKeyRetention: config.teamCreationKeyRetention,
    purgeSigningKey: unwrap(loadSigningKey(config.purgeSigningKeyPem)),
  }
  const logger = ctx.logger('organization-governance')
  // 公共定义的模块增补拥有五个事件的签名；
  // TS 不能把泛型 K 下的 Events[K] 与 OrganizationGovernanceEvents[K] 对上，这里只收窄调用形状，不改运行行为
  const emit = ctx.emit.bind(ctx) as (name: string, payload: unknown) => void
  const storage = ctx.get(STORAGE_SERVICE) as StorageService & AtomicStorage
  if (typeof storage.atomic !== 'function')
    throw new StorageDefect('organization-governance requires AtomicStorage')
  const deps: Deps = {
    storage,
    clock: ctx.get(CLOCK_SERVICE) as Clock,
    accounts: ctx.get(ACCOUNTS_SERVICE) as AccountsReadFace,
    logins: ctx.get(LOGINS_SERVICE) as LoginsVerifyFace,
    config: resolved,
    logger,
    notify(name, payload) {
      // S-40：发出方不等待监听者、不读返回值；监听者同步抛出不得改变已提交的事实，只留一条可观测的记录（DP-05）。
      // 记 error 而不是 warn：Cordis 的默认导出阈值是 INFO，而它的 WARN 级别排在 INFO 之后，warn 默认不导出
      try {
        emit(name, payload)
      } catch (error) {
        logger.error(
          'listener of %s threw after the commit; the committed fact stands: %o',
          name,
          error,
        )
      }
    },
  }
  const instance = createOrganizationGovernance(deps)
  own(() => instance.close())
  new OrganizationsSqlService(ctx, instance.organizations)
  new MembershipsSqlService(ctx, instance.memberships)
  new OffersSqlService(ctx, instance.offers)
  new OrganizationPurgeSqlService(ctx, instance.organizationPurge)
}

export const organizationGovernancePlugin = definePlugin<ParsedConfig>({
  name: 'organization-governance-sql',
  inject: [STORAGE_SERVICE, CLOCK_SERVICE, ACCOUNTS_SERVICE, LOGINS_SERVICE],
  Config: OrganizationGovernanceConfigSchema,
  apply(ctx: Context, config) {
    bind(ctx, config, close => {
      ctx.effect(() => close)
    })
  },
})

export const managedOrganizationGovernancePlugin = Object.assign(
  definePlugin<ParsedConfig>({
    name: 'organization-governance-sql-managed',
    inject: [
      STORAGE_SERVICE,
      CLOCK_SERVICE,
      ACCOUNTS_SERVICE,
      LOGINS_SERVICE,
      ASSEMBLY_LIFETIME_SERVICE,
    ],
    Config: OrganizationGovernanceConfigSchema,
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
  { assemblyLifecycle: 1 as const, describeAssembly },
)
