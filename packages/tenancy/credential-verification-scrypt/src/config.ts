import { z } from 'zod'
import { scryptParametersValid } from './scrypt.ts'

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
