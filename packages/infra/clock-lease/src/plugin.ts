import {
  ASSEMBLY_LIFETIME_SERVICE,
  startAssemblyWork,
} from '@omne-harness-lite/assembly-lifecycle/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { AssemblyDeclaration } from '@omne-harness-lite/cordis-plugin-tree'
import { CLOCK_SERVICE } from '@omne-harness-lite/offer-expiry/cordis'
import type { z } from 'zod'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import type { Storage } from '@omne-harness-lite/storage'
import { STORAGE_SERVICE } from '@omne-harness-lite/storage/cordis'
import { LeaseClock } from './clock.ts'
import { ClockConfig } from './config.ts'
import { LeaseClockService } from './service.ts'

function describeAssembly(value: unknown): AssemblyDeclaration {
  const config = ClockConfig.parse(value)
  return {
    provides: [CLOCK_SERVICE],
    requires: [STORAGE_SERVICE],
    optional: [],
    dynamicProvides: [],
    dynamicRequires: [],
    claims: [{ name: 'tenancy-host/clock', version: 1, config }],
  }
}

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

export const managedClockPlugin = Object.assign(
  definePlugin<z.infer<typeof ClockConfig>>({
    name: 'clock-lease-managed',
    inject: [STORAGE_SERVICE, ASSEMBLY_LIFETIME_SERVICE],
    Config: ClockConfig,
    apply(ctx: Context, config) {
      let resource: LeaseClock | undefined
      startAssemblyWork(
        ctx,
        async () => {
          resource = new LeaseClock({ storage: ctx.storage, logger: ctx.logger('clock-lease') })
          await resource.start()
          ctx.fiber.assertActive()
          if (!ctx.assemblyLifetime.isCurrent()) throw new Error('Assembly work has stopped')
          new LeaseClockService(ctx, resource)
        },
        async () => {
          await resource?.close()
        },
      )
    },
  }),
  { assemblyLifecycle: 1 as const, describeAssembly },
)
