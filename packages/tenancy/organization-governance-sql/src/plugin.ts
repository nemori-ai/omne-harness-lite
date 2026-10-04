import { STORAGE_SERVICE, type StorageService } from '@omne-harness-lite/storage/cordis'
import { CLOCK_SERVICE } from '@omne-harness-lite/offer-expiry/cordis'
// 一个插件、一条 fiber；四个 Service 定义由公共包拥有。行为与装卸承诺见 SPEC.md。
import type { Context } from '@deepseek-ai/cordis'
import type { z } from 'zod'
import { OrganizationGovernanceConfigSchema } from './config.ts'
import { ACCOUNTS_SERVICE, LOGINS_SERVICE } from '@omne-harness-lite/account-identity'
import { loadSigningKey, unwrap } from '@omne-harness-lite/identity-values'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import { StorageDefect, type AtomicStorage } from '@omne-harness-lite/storage'
import { createMembershipsService } from './memberships.ts'
import { createOffersService } from './offers.ts'
import { createOrganizationsService } from './organizations.ts'
import { createOrganizationPurgeService } from './purge.ts'
import type { AccountsReadFace, Deps, LoginsVerifyFace, ResolvedConfig } from './runtime.ts'
import type { OrganizationGovernanceEvents } from '@omne-harness-lite/organization-governance'
import {
  OrganizationsSqlService,
  MembershipsSqlService,
  OffersSqlService,
  OrganizationPurgeSqlService,
} from './provided-services.ts'

type ParsedConfig = z.output<typeof OrganizationGovernanceConfigSchema>

export const organizationGovernancePlugin = definePlugin<ParsedConfig>({
  name: 'organization-governance',
  inject: [STORAGE_SERVICE, CLOCK_SERVICE, ACCOUNTS_SERVICE, LOGINS_SERVICE],
  Config: OrganizationGovernanceConfigSchema,
  apply(ctx: Context, config) {
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
    new OrganizationsSqlService(ctx, createOrganizationsService(deps))
    new MembershipsSqlService(ctx, createMembershipsService(deps))
    new OffersSqlService(ctx, createOffersService(deps))
    new OrganizationPurgeSqlService(ctx, createOrganizationPurgeService(deps))
  },
})
