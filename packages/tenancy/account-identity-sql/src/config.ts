import { z } from 'zod'
import { isOk, loadVerificationKey } from '@omne-harness-lite/identity-values'
import type { AccountIdentityConfig } from '@omne-harness-lite/account-identity'
import type { Duration } from '@omne-harness-lite/offer-expiry'

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
    credentialPolicy: z.unknown().optional(),
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
