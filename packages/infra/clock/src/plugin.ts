import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { definePlugin } from '@omne-harness-lite/kernel-basis'
import type { Storage } from '@omne-harness-lite/storage'
import { LeaseClock } from './clock.ts'

export const CLOCK_SERVICE = 'clock' as const

/** 本版无 config：租约宽度与续约周期是包内常量。 */
export const ClockConfig = z.object({}).strict()

export const clockPlugin = definePlugin<z.infer<typeof ClockConfig>>({
  name: 'clock',
  inject: ['storage'],
  Config: ClockConfig,
  async apply(ctx: Context) {
    const storage = ctx.get('storage') as Storage
    const clock = new LeaseClock({
      storage,
      onRenewFailure: error => ctx.logger.warn('clock lease write failed: %s', String(error)),
    })
    await clock.start()
    try {
      ctx.effect(() => () => clock.close())
    } catch (error) {
      await clock.close()
      throw error
    }
    ctx.provide(CLOCK_SERVICE, clock)
  },
})
