import { z } from 'zod'
import { tenantCodec } from '@omne-harness/legal-identity'
import { decodeHistoricalTextInterpretation } from '@omne-harness/tool'
import { decodeToolCallId } from '@omne-harness/tool-contract'

const interpretation = z.unknown().transform((value, ctx) => {
  const result = decodeHistoricalTextInterpretation(value)
  if ('ok' in result) return result.ok
  ctx.addIssue({ code: 'custom', message: 'invalid historical text interpretation' })
  return z.NEVER
})

export const toolHistoryConfigSchema = z.strictObject({
  mode: z.enum(['verify', 'upgrade']),
  interpretations: z
    .array(
      z.strictObject({
        tenant: z.string().refine(value => tenantCodec.parse(value).ok, 'invalid tenant'),
        call: z.string().refine(value => 'ok' in decodeToolCallId(value), 'invalid call'),
        values: z.array(interpretation),
      }),
    )
    .superRefine((entries, ctx) => {
      const addresses = new Set<string>()
      for (const [index, entry] of entries.entries()) {
        const tenant = tenantCodec.parse(entry.tenant)
        const encoded = tenant.ok ? tenantCodec.encode(tenant.value) : null
        const key = JSON.stringify([encoded?.ok ? encoded.value : entry.tenant, entry.call])
        if (addresses.has(key))
          ctx.addIssue({
            code: 'custom',
            message: 'duplicate historical call address',
            path: [index],
          })
        addresses.add(key)
      }
    }),
})
