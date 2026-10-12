import { z } from 'zod'
import { isOk, loadSigningKey } from '@omne-harness-lite/identity-values'
import { type Duration, parseOfferTtl } from '@omne-harness-lite/offer-expiry'

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
