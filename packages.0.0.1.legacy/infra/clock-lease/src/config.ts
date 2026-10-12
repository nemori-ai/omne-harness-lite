import { z } from 'zod'

/** Creation is explicit. A normal open never recreates a missing clock resource. */
export const ClockConfig = z
  .object({
    file: z.string().min(1),
    initialize: z.boolean().optional(),
  })
  .strict()
