// account-registration 插件：一条 fiber、一个服务面 `registration`。插件体只做 config 校验与一次 provide；
// 不拥有任何事实、没有存储、没有定时器（节点设计「成对的装载与撤除」）。三个参与方服务面都是必需 inject：
// 任一缺席 ⇒ 本 fiber PENDING、`registration` 不可解析；任一换代 ⇒ 插件体卸载重跑（basis plugin-body-reruns-on-provider-change）。
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { ACCOUNTS_SERVICE, type AccountsService } from '@omne-harness-lite/account-identity'
import { isOk, loadSigningKey } from '@omne-harness-lite/identity-values'
import { definePlugin, fiberIsActive } from '@omne-harness-lite/kernel-basis/cordis'
import {
  ORGANIZATIONS_SERVICE,
  ORGANIZATION_PURGE_SERVICE,
} from '@omne-harness-lite/organization-governance/cordis'
import {
  type OrganizationPurgeService,
  type OrganizationsService,
} from '@omne-harness-lite/organization-governance'
import { createRegistrationService } from './registration.ts'
import {
  type AccountRegistrationConfig,
  REGISTRATION_SERVICE,
  type RegistrationDefectRecord,
} from './types.ts'

/**
 * 加载时校验：`activationSigningKeyPem` 是 Ed25519 私钥（PEM PKCS8）。不过 ⇒ fiber FAILED、不 provide
 * （basis `plugin-throw-fails-fiber`）——漏配的部署不半开着跑、把每次注册都记成 `interrupted`。
 */
export const AccountRegistrationConfigSchema: z.ZodType<AccountRegistrationConfig, unknown> = z
  .object({
    activationSigningKeyPem: z.string().superRefine((pem, ctx) => {
      const loaded = loadSigningKey(pem)
      if (!isOk(loaded)) ctx.addIssue({ code: 'custom', message: loaded.invalidInput })
    }),
  })
  .strict()

export const registrationPlugin = definePlugin<AccountRegistrationConfig>({
  name: 'account-registration',
  inject: [ACCOUNTS_SERVICE, ORGANIZATIONS_SERVICE, ORGANIZATION_PURGE_SERVICE],
  Config: AccountRegistrationConfigSchema,
  apply(ctx: Context, config) {
    const activationKey = loadSigningKey(config.activationSigningKeyPem)
    if (!isOk(activationKey)) {
      // config 校验已挡住；到这里说明校验与装载不一致，按启动失败处理
      throw new Error(
        'account-registration: activation signing key failed to load after validation',
      )
    }
    const logger = ctx.logger('account-registration')

    // 「本插件这一代仍在」＝ fiber ACTIVE 且本次插件体的 effect 尚未被收回。只看 fiber 状态不够：
    // 必需服务换代时同一条 fiber 卸载后重跑、很快回到 ACTIVE，而在途调用手里握着的是上一代的服务快照。
    let generationLive = true
    const inFlight = new Set<Promise<unknown>>()
    function track<T>(work: Promise<T>): Promise<T> {
      inFlight.add(work)
      // Observe both outcomes immediately without changing the caller's result.
      work.then(
        () => inFlight.delete(work),
        () => inFlight.delete(work),
      )
      return work
    }
    ctx.effect(
      () => async () => {
        generationLive = false
        await Promise.allSettled([...inFlight])
      },
      'account-registration generation',
    )

    const service = createRegistrationService({
      accounts: ctx.get(ACCOUNTS_SERVICE) as AccountsService,
      organizations: ctx.get(ORGANIZATIONS_SERVICE) as OrganizationsService,
      organizationPurge: ctx.get(ORGANIZATION_PURGE_SERVICE) as OrganizationPurgeService,
      activationKey: activationKey.ok,
      isActive: () => generationLive && fiberIsActive(ctx),
      recordDefect(record: RegistrationDefectRecord) {
        // error 级：Cordis 缺省只导出到 INFO，warn 默认看不见（basis logger-level-order-error-lowest）。
        // 记录本身是结构化对象，只含失败本名、步骤与 AccountId；不含登录标识、凭据与依据
        logger.error('registration defect: %o', record)
      },
    })
    ctx.provide(REGISTRATION_SERVICE, {
      register: (identifier: unknown, credential: unknown) =>
        track(service.register(identifier, credential)),
      purgeExpired: (account: unknown) => track(service.purgeExpired(account)),
    })
  },
})
