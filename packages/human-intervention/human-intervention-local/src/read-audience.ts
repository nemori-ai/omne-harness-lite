import { z } from 'zod'
import {
  HitlIdentifierSchema,
  OriginSchema,
  RequestRefSchema,
  TenantRefSchema,
  WaitRefSchema,
} from '@omne-harness/human-intervention'
import { digestSchema } from './relational-values.ts'
import { digest, equal } from './encoding.ts'

const fields = {
  protocol: z.literal('hitl-read-audience/1'),
  tenantRef: TenantRefSchema,
  waitRef: WaitRefSchema,
  preparationRef: HitlIdentifierSchema,
  registrationDigest: digestSchema,
  readers: z.array(HitlIdentifierSchema).min(1).max(64).readonly(),
}
export const ReadAudienceSchema = z
  .strictObject({ ...fields, audienceDigest: digestSchema })
  .refine(value => equal(value.readers, [...new Set(value.readers)].sort()), {
    message: 'Audience must be a canonical set',
  })
  .refine(({ audienceDigest, ...value }) => audienceDigest === digest(value), {
    message: 'Audience digest mismatch',
  })
  .readonly()
export type ReadAudience = z.infer<typeof ReadAudienceSchema>
export function readAudience(
  value: Omit<ReadAudience, 'protocol' | 'audienceDigest'>,
): ReadAudience {
  const basis = {
    ...value,
    protocol: 'hitl-read-audience/1' as const,
    readers: [...new Set(value.readers)].sort(),
  }
  return ReadAudienceSchema.parse({ ...basis, audienceDigest: digest(basis) })
}
export const AudienceExportSchema = z
  .strictObject({
    requestRef: RequestRefSchema,
    origin: OriginSchema,
    audience: ReadAudienceSchema,
  })
  .refine(
    value =>
      value.requestRef.tenantRef === value.audience.tenantRef &&
      equal(value.origin.wait, value.audience.waitRef),
  )
