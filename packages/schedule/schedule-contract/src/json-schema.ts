import { z } from 'zod'
import { ScheduleJsonValueSchema } from './values.ts'

export function scheduleJsonSchema(schema: z.ZodType) {
  return z.toJSONSchema(schema, {
    unrepresentable: ({ zodSchema }) =>
      zodSchema === ScheduleJsonValueSchema
        ? { type: ['null', 'boolean', 'number', 'string', 'array', 'object'] }
        : 'throw',
  })
}
