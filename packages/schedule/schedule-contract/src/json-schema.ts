import { z } from 'zod'
import { ScheduleJsonValueSchema } from './values.ts'

/** JSON documents cannot contain runtime objects; the boundary schema additionally validates numbers. */
export function scheduleJsonSchema(schema: z.ZodType) {
  return z.toJSONSchema(schema, {
    unrepresentable: ({ zodSchema }) =>
      zodSchema === ScheduleJsonValueSchema
        ? { type: ['null', 'boolean', 'number', 'string', 'array', 'object'] }
        : 'throw',
  })
}
