import { z } from 'zod'
import type { StandingItem } from './delivery-model.ts'
import { eventTypeNameSchema, instantSchema, locatorSchema, sourceNameSchema } from './values.ts'

/** The shape of this group's need for standing items: what each block bound to it has to hold. */
export const standingItemsSchema: z.ZodType<readonly StandingItem[]> = z
  .array(
    z
      .strictObject({
        id: z.string().min(1),
        source: sourceNameSchema,
        type: eventTypeNameSchema,
        subject: z.string().nullable(),
        title: z.string(),
        locator: locatorSchema.nullable(),
        since: instantSchema,
      })
      .readonly(),
  )
  .readonly()
