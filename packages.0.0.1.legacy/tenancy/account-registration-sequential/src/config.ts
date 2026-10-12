import { z } from 'zod'
import { isOk, loadSigningKey } from '@omne-harness-lite/identity-values'
import type { AccountRegistrationConfig } from '@omne-harness-lite/account-registration'

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
