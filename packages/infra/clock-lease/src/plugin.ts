import type { Context } from '@deepseek-ai/cordis'
import type { z } from 'zod'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import type { Storage } from '@omne-harness-lite/storage'
import { STORAGE_SERVICE } from '@omne-harness-lite/storage/cordis'
import { LeaseClock } from './clock.ts'
import { ClockConfig } from './config.ts'
import { LeaseClockService } from './service.ts'

export const clockPlugin = definePlugin<z.infer<typeof ClockConfig>>({
  name: 'clock-lease',
  inject: [STORAGE_SERVICE],
  Config: ClockConfig,
  async apply(ctx: Context) {
    const storage = ctx.get(STORAGE_SERVICE) as Storage
    const clock = new LeaseClock({ storage, logger: ctx.logger })
    await clock.start()
    try {
      ctx.effect(() => () => clock.close())
    } catch (error) {
      await clock.close()
      throw error
    }
    new LeaseClockService(ctx, clock)
  },
})
