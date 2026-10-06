import { CLOCK_SERVICE } from '@omne-harness-lite/offer-expiry/cordis'
import type { Context } from '@deepseek-ai/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { RuntimeContextService } from '@omne-harness-lite/runtime-context/cordis'
import type {
  RuntimeContextOperations,
  ContextSourceRegistrations,
  ContextSourceHandle,
} from '@omne-harness-lite/runtime-context'
import { SESSION_LOG } from '@omne-harness-lite/session-log/cordis'
import { SESSION_ACCESS } from '@omne-harness-lite/session-tenancy/cordis'
import { z } from 'zod'
import { instantToRfc3339, type Clock } from '@omne-harness-lite/offer-expiry'
import { createRuntimeContext } from './runtime.ts'
class Provider extends RuntimeContextService {
  constructor(
    ctx: Context,
    private readonly operations: RuntimeContextOperations,
    private readonly sources: ContextSourceRegistrations,
  ) {
    super(ctx)
  }
  bind(...args: Parameters<RuntimeContextOperations['bind']>) {
    return this.operations.bind(...args)
  }
  registrations(...args: Parameters<RuntimeContextOperations['registrations']>) {
    return this.operations.registrations(...args)
  }
  register(...args: Parameters<RuntimeContextOperations['register']>) {
    return this.operations.register(...args)
  }
  update(...args: Parameters<RuntimeContextOperations['update']>) {
    return this.operations.update(...args)
  }
  remove(...args: Parameters<RuntimeContextOperations['remove']>) {
    return this.operations.remove(...args)
  }
  registerSource(...args: Parameters<ContextSourceRegistrations['registerSource']>) {
    let handle: ContextSourceHandle | undefined
    const dispose = this.ctx.effect(() => {
      handle = this.sources.registerSource(...args)
      return handle.dispose
    })
    if (!handle) throw new Error('source registration effect did not run')
    return Object.freeze({
      generation: handle.generation,
      invalidate: handle.invalidate,
      dispose: async () => {
        await dispose()
      },
    })
  }
}
export const runtimeContextLocal = definePlugin({
  name: 'runtime-context-local',
  inject: [SESSION_LOG, SESSION_ACCESS, CLOCK_SERVICE],
  Config: z.object({}).strict(),
  apply(ctx) {
    const time: unknown = ctx.get(CLOCK_SERVICE)
    if (!time || typeof time !== 'object' || !('now' in time) || typeof time.now !== 'function')
      throw new TypeError('runtime context requires Clock')
    const clock = time as Clock
    const owner = createRuntimeContext({
      log: ctx.sessionLog,
      access: ctx.sessionAccess,
      now() {
        const value = clock.now()
        return value === 'unavailable' ? { unavailable: true } : instantToRfc3339(value)
      },
      changed: () => {
        ctx.emit('runtime-context/cache-invalidated')
      },
      diagnostic: stage => {
        ctx.logger.error(`runtime_context.${stage}_unavailable`)
      },
    })
    ctx.effect(() => async () => {
      owner.closeAdmission()
      await owner.drain()
    })
    new Provider(ctx, owner.operations, owner.sources)
  },
})
