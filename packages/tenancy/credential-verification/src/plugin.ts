// credential-verification 插件：config 校验 → provide('credentials')。无状态、无存储、无提交点、无定时器；
// 撤除只让服务消失，在途的 scrypt 计算跑完、结果照常交给调用方（本包的方法不依赖 fiber 状态）。
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { scryptParametersValid } from './scrypt.ts'
import { createPasswordCredentials } from './service.ts'

export const CREDENTIALS_SERVICE = 'credentials' as const

/**
 * 派生参数（插件 config，**不是** `credential_policy`）。缺省值取 OWASP Password Storage Cheat Sheet 对 scrypt 的
 * 最低建议（N = 2^17、r = 8、p = 1），盐 16 字节、哈希 32 字节。非法 ⇒ config 校验不过 ⇒ fiber FAILED、不 provide。
 */
export const CredentialVerificationConfig = z
  .object({
    cost: z
      .number()
      .int()
      .default(2 ** 17),
    blockSize: z.number().int().default(8),
    parallelization: z.number().int().default(1),
    saltBytes: z.number().int().min(16).max(64).default(16),
    keyBytes: z.number().int().min(16).max(64).default(32),
  })
  .strict()
  .refine(scryptParametersValid, {
    message: 'scrypt parameters: cost must be a power of two ≥ 2 and within the memory bound',
  })
export type CredentialVerificationConfig = z.infer<typeof CredentialVerificationConfig>

export const credentialsPlugin = definePlugin<CredentialVerificationConfig>({
  name: 'credential-verification',
  Config: CredentialVerificationConfig,
  apply(ctx: Context, config) {
    ctx.provide(CREDENTIALS_SERVICE, createPasswordCredentials(config))
  },
})
