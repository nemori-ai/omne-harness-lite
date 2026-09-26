// 一个 Cordis 插件、一条 fiber、四个服务面（design「实现路径与来源」）。
// 插件体只校验 config 与 provide；事实全在存储里，可重跑（提供者换代 ⇒ 重跑，basis plugin-body-reruns-on-provider-change）。
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { ACCOUNTS_SERVICE, LOGINS_SERVICE } from '@omne-harness-lite/account-identity'
import { isOk, loadSigningKey, unwrap } from '@omne-harness-lite/identity-values'
import { definePlugin } from '@omne-harness-lite/kernel-basis'
import { type Clock, type Duration, parseOfferTtl } from '@omne-harness-lite/offer-expiry'
import { StorageDefect, type AtomicStorage } from '@omne-harness-lite/storage'
import { createMembershipsService } from './memberships.ts'
import { createOffersService } from './offers.ts'
import { createOrganizationsService } from './organizations.ts'
import { createOrganizationPurgeService } from './purge.ts'
import type { AccountsReadFace, Deps, LoginsVerifyFace, ResolvedConfig } from './runtime.ts'
import {
  MEMBERSHIPS_SERVICE,
  OFFERS_SERVICE,
  ORGANIZATIONS_SERVICE,
  ORGANIZATION_PURGE_SERVICE,
  type OrganizationGovernanceEvents,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'invitation.issued': OrganizationGovernanceEvents['invitation.issued']
    'membership.changed': OrganizationGovernanceEvents['membership.changed']
    'role.changed': OrganizationGovernanceEvents['role.changed']
    'affiliation.dissolved': OrganizationGovernanceEvents['affiliation.dissolved']
    'organization.purged': OrganizationGovernanceEvents['organization.purged']
  }
}

export const STORAGE_SERVICE = 'storage' as const
export const CLOCK_SERVICE = 'clock' as const

/** 正时长：`parseOfferTtl` 同一条判据（OE S-14／S-17：配错即启动失败）。 */
const positiveDuration = z.unknown().transform((value, ctx): Duration => {
  const parsed = parseOfferTtl(value)
  if (isOk(parsed)) return parsed.ok
  ctx.addIssue({ code: 'custom', message: parsed.invalidInput })
  return z.NEVER
})

/**
 * config 在插件体运行前由内核校验（kernel-basis `definePlugin`）：任一项不合 ⇒ fiber FAILED、四个面都不 provide。
 * 签名私钥缺或形状不对是配置错误，不做成运行期 `unavailable`——那会让清除链无限重扫而不记缺陷。
 */
export const OrganizationGovernanceConfigSchema = z
  .object({
    invitationTtlDefault: positiveDuration,
    affiliationRequestTtlDefault: positiveDuration,
    teamCreationKeyRetention: positiveDuration,
    purgeSigningKeyPem: z.string().superRefine((pem, ctx) => {
      const loaded = loadSigningKey(pem)
      if (!isOk(loaded)) ctx.addIssue({ code: 'custom', message: loaded.invalidInput })
    }),
  })
  .strict()

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
    // 上面的模块增补让五个事件名成为 Events 的键、签名与 OrganizationGovernanceEvents 逐一相同；
    // TS 不能把泛型 K 下的 Events[K] 与 OrganizationGovernanceEvents[K] 对上，这里只收窄调用形状，不改运行行为
    const emit = ctx.emit.bind(ctx) as (name: string, payload: unknown) => void
    const storage = ctx.get(STORAGE_SERVICE) as AtomicStorage
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
    ctx.provide(ORGANIZATIONS_SERVICE, createOrganizationsService(deps))
    ctx.provide(MEMBERSHIPS_SERVICE, createMembershipsService(deps))
    ctx.provide(OFFERS_SERVICE, createOffersService(deps))
    ctx.provide(ORGANIZATION_PURGE_SERVICE, createOrganizationPurgeService(deps))
  },
})
