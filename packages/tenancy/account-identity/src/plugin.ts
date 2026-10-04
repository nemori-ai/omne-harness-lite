import { copyJsonValue } from '@omne-harness-lite/content-blocks'
// account-identity 插件：一条 fiber、两个服务面。必需 inject `storage`、`clock`；`credentials` 是可选依赖，调用时解析——
// 认证换代时本插件不重跑，治理不受波及（节点设计「S-15 归本节点，credentials 作可选依赖、在调用时解析」）。
// 无连接池/后台任务；消费者须排空含事务外凭据准备的业务后撤除，不能以运输连接关闭代替业务静止。
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import {
  CREDENTIALS_SERVICE,
  type CredentialsService,
} from '@omne-harness-lite/credential-verification'
import { isOk, loadVerificationKey } from '@omne-harness-lite/identity-values'
import { definePlugin, resolveOptional } from '@omne-harness-lite/kernel-basis'
import type { Clock, Duration } from '@omne-harness-lite/offer-expiry'
import type { AtomicStorage } from '@omne-harness-lite/storage'
import { AccountsImpl } from './accounts.ts'
import type { ServiceDeps } from './deps.ts'
import { contextNotifier, loggerDiagnostics } from './diagnostics.ts'
import { LoginsImpl } from './logins.ts'
import { cryptoRandomSource } from './presentation.ts'
import { ACCOUNTS_SERVICE, type AccountIdentityConfig, LOGINS_SERVICE } from './surface.ts'

const verificationKeyPem = z
  .string()
  .refine(pem => isOk(loadVerificationKey(pem)), 'not an Ed25519 public key (PEM SPKI)')

/**
 * 加载时校验：`unactivatedRetention` 为正整数毫秒、两把公钥存在且是 Ed25519 公钥。
 * 不过 ⇒ fiber FAILED、不 provide 任何服务（basis `plugin-throw-fails-fiber`）——一份漏配的部署不半开着跑。
 * `credentialPolicy` 缺省不是启动失败：契约把「取不到」定为 S-13 的 `credential-rejected`。
 */
export const AccountIdentityConfigSchema: z.ZodType<AccountIdentityConfig, unknown> = z
  .object({
    // 键缺席与值为 undefined 同义：契约 S-27「缺席不是启动失败」
    credentialPolicy: z.unknown().refine(value => 'ok' in copyJsonValue(value), 'credential policy must be JSON data').optional(),
    unactivatedRetention: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .transform(ms => ms as Duration),
    activationVerificationKeyPem: verificationKeyPem,
    purgeVerificationKeyPem: verificationKeyPem,
  })
  .strict()

export const accountIdentityPlugin = definePlugin<AccountIdentityConfig>({
  name: 'account-identity',
  inject: ['storage', 'clock'],
  Config: AccountIdentityConfigSchema,
  apply(ctx: Context, config) {
    const activationKey = loadVerificationKey(config.activationVerificationKeyPem)
    const purgeKey = loadVerificationKey(config.purgeVerificationKeyPem)
    if (!isOk(activationKey) || !isOk(purgeKey)) {
      // config 校验已挡住；到这里说明校验与装载不一致，按启动失败处理
      throw new Error('account-identity: verification keys failed to load after validation')
    }
    const storage = ctx.get('storage') as AtomicStorage
    if (typeof storage.atomic !== 'function')
      throw new Error('account-identity: explicit atomic storage is required')
    const diagnostics = loggerDiagnostics(ctx.logger('account-identity'))
    const deps: ServiceDeps = {
      storage,
      clock: ctx.get('clock') as Clock,
      resolveCredentials: () => resolveOptional<CredentialsService>(ctx, CREDENTIALS_SERVICE),
      credentialPolicy: config.credentialPolicy,
      unactivatedRetention: config.unactivatedRetention,
      activationKey: activationKey.ok,
      purgeKey: purgeKey.ok,
      notifier: contextNotifier(ctx, diagnostics),
      diagnostics,
      // 插件体不传别的随机源：生产路径恒为 node:crypto
      random: cryptoRandomSource,
    }
    ctx.provide(ACCOUNTS_SERVICE, new AccountsImpl(deps))
    ctx.provide(LOGINS_SERVICE, new LoginsImpl(deps))
  },
})
