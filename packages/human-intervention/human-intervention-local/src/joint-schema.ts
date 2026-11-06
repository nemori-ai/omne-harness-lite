import { z } from 'zod'
import { RequestPlanSchema } from './request-schema.ts'
import { WaitPlanSchema } from './wait-schema.ts'
import { digestSchema } from './relational-values.ts'

export const JointPlanSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('request-plan'),
      waitPlanDigest: digestSchema,
      plan: RequestPlanSchema,
    }),
    z.strictObject({
      kind: z.literal('wait-operation'),
      waitPlanDigest: digestSchema,
      plan: WaitPlanSchema,
    }),
  ])
  .readonly()
