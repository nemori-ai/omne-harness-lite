import { z } from 'zod'

/** 本版无 config：租约宽度与续约周期是包内常量。 */
export const ClockConfig = z.object({}).strict()
