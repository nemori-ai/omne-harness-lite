import { z } from 'zod'

export const SqlSequenceSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,18})$/)
  .refine(value => BigInt(value) <= 9223372036854775807n)
