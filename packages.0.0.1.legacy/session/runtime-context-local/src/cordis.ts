import { STORAGE_SERVICE } from '@omne-harness-lite/storage/cordis'
import { CLOCK_SERVICE } from '@omne-harness-lite/offer-expiry/cordis'
import type { Context } from '@deepseek-ai/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { RUNTIME_CONTEXT, RuntimeContextService } from '@omne-harness-lite/runtime-context/cordis'
import type {
  RuntimeContextOperations,
  ContextSourceRegistrations,
  ContextSourceHandle,
} from '@omne-harness-lite/runtime-context'
import { SESSION_LOG_BACKING } from '@omne-harness-lite/session-log/cordis'
import { SESSION_ACCESS } from '@omne-harness-lite/session-tenancy/cordis'
import { z } from 'zod'
import { instantToRfc3339, type Clock } from '@omne-harness-lite/offer-expiry'
import { createRuntimeContext } from './runtime.ts'
import {
  ASSEMBLY_LIFETIME_SERVICE,
  startRetainedAssemblyWork,
} from '@omne-harness-lite/assembly-lifecycle/cordis'
import type { AssemblyDeclaration } from '@omne-harness-lite/cordis-plugin-tree'
import type { ContextSessionInitializer } from '@omne-harness-lite/runtime-context'
import type { SessionLogBackingOperations } from '@omne-harness-lite/session-log'
import { verifyProjectionStorage } from './projection-store.ts'
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
const Config = z.object({}).strict()
const requires = [SESSION_LOG_BACKING, SESSION_ACCESS, CLOCK_SERVICE, STORAGE_SERVICE] as const

/** One trusted factory owns the service generation, initializer and original dependency borrow. */
export function createRuntimeContextLocal() {
  let mounted = false,
    stopped = false,
    initialized = false
  let owner: ReturnType<typeof createRuntimeContext> | undefined
  let borrow: ReturnType<SessionLogBackingOperations['borrow']> | undefined
  const ready = Promise.withResolvers<void>()
  // The factory can be discarded before mounting. Readiness is also observed by the managed row.
  void ready.promise.catch(() => undefined)
  function closeAdmission() {
    stopped = true
    owner?.closeAdmission()
  }
  async function close() {
    closeAdmission()
    await owner?.drain()
    await borrow?.release()
  }
  const plugin = Object.assign(
    definePlugin({
      name: 'runtime-context-local',
      inject: [...requires, ASSEMBLY_LIFETIME_SERVICE],
      Config,
      apply(ctx) {
        if (mounted) throw new Error('runtime context factory already mounted')
        mounted = true
        // Capture original generation references before asynchronous setup or shutdown.
        const backing = ctx.sessionLogBacking,
          storage = ctx.storage,
          access = ctx.sessionAccess
        const clock: Clock = ctx.clock
        startRetainedAssemblyWork(
          ctx,
          async () => {
            try {
              if (stopped) throw new Error('runtime context owner stopped')
              borrow = backing.borrow()
              owner = createRuntimeContext({
                log: borrow.log,
                storage,
                access,
                async now() {
                  const value = await clock.now()
                  return value === 'unavailable' ? { unavailable: true } : instantToRfc3339(value)
                },
                changed: () => {
                  ctx.emit('runtime-context/cache-invalidated')
                },
                diagnostic: stage => {
                  ctx.logger.error(`runtime_context.${stage}_unavailable`)
                },
              })
              await verifyProjectionStorage(storage)
              if (stopped) throw new Error('runtime context owner stopped during setup')
              new Provider(ctx, owner.operations, owner.sources)
              initialized = true
              ready.resolve()
            } catch (error) {
              ready.reject(error)
              throw error
            }
          },
          close,
        )
      },
    }),
    {
      assemblyLifecycle: 1 as const,
      describeAssembly(value: unknown): AssemblyDeclaration {
        Config.parse(value)
        return {
          provides: [RUNTIME_CONTEXT],
          requires: [...requires],
          optional: [],
          dynamicProvides: [],
          dynamicRequires: [],
          claims: [],
        }
      },
    },
  )
  const initializer: ContextSessionInitializer = Object.freeze({
    initializeContextSession(
      ...args: Parameters<ContextSessionInitializer['initializeContextSession']>
    ) {
      if (stopped) return Promise.resolve({ kind: 'rejected', reason: 'ownerStopped' } as const)
      if (!owner || !initialized)
        return Promise.resolve({ kind: 'rejected', reason: 'unavailable' } as const)
      return owner.initializer.initializeContextSession(...args)
    },
  })
  return Object.freeze({ plugin, initializer, ready: ready.promise, closeAdmission })
}
