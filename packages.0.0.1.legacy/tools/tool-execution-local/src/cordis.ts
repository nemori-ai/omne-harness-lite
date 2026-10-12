import { type Context } from '@deepseek-ai/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { z } from 'zod'
import {
  ASSEMBLY_LIFETIME_SERVICE,
  startAssemblyWork,
} from '@omne-harness-lite/assembly-lifecycle/cordis'
import type { AssemblyDeclaration } from '@omne-harness-lite/cordis-plugin-tree'
import { createRetainedWork } from '@omne-harness-lite/assembly-lifecycle'
import {
  ToolRuntimeRegistryService,
  ToolImplementationsService,
} from '@omne-harness-lite/tool-execution-runtime/cordis'
import type {
  ToolPoolAdmission,
  ToolImplementationOperations,
} from '@omne-harness-lite/tool-execution-runtime'
import { createToolRuntimeRegistry } from './registry.ts'
import { createToolImplementationRegistry } from './implementations.ts'
import {
  TOOL_RUNTIME_REGISTRY,
  TOOL_IMPLEMENTATIONS,
  TOOL_RUNTIME_STARTUP,
} from '@omne-harness-lite/tool-execution-runtime/cordis'

export {
  toolEnvironmentPlacement,
  managedToolEnvironmentPlacement,
} from './environment-placement-cordis.ts'

class RuntimeRegistry extends ToolRuntimeRegistryService {
  private readonly operations = createToolRuntimeRegistry()
  register(provider: ToolPoolAdmission) {
    const dispose = this.ctx.effect(() => this.operations.register(provider))
    return async () => {
      await dispose()
    }
  }
  submit(...args: Parameters<ToolPoolAdmission['submit']>) {
    return this.operations.submit(...args)
  }
  async acquire(
    ...args: Parameters<ToolPoolAdmission['acquire']>
  ): ReturnType<ToolPoolAdmission['acquire']> {
    // Install ownership before awaiting acquisition; caller disposal may win that race.
    let released = false
    let release: (() => void) | undefined
    const finish = () => {
      if (released) return
      released = true
      release?.()
    }
    const dispose = this.ctx.effect(() => finish, 'tool-runtime-registry.observer')
    let result: Awaited<ReturnType<ToolPoolAdmission['acquire']>>
    try {
      result = await this.operations.acquire(...args)
    } catch (error) {
      await dispose()
      throw error
    }
    if (result.kind !== 'acquired') {
      await dispose()
      return result
    }
    release = result.observer.release
    if (released) {
      release()
      await dispose()
      return { kind: 'rejected', reason: 'ownerStopped' }
    }
    return {
      ...result,
      observer: Object.freeze({
        ...result.observer,
        release() {
          finish()
          void dispose()
        },
      }),
    }
  }
  stop(...args: Parameters<ToolPoolAdmission['stop']>) {
    return this.operations.stop(...args)
  }
  answer(...args: Parameters<ToolPoolAdmission['answer']>) {
    return this.operations.answer(...args)
  }
}
class ImplementationRegistry extends ToolImplementationsService {
  private readonly operations = createToolImplementationRegistry()
  register(...args: Parameters<ToolImplementationOperations['register']>) {
    const dispose = this.ctx.effect(() => this.operations.register(...args))
    return () => {
      void dispose()
    }
  }
  acquire(...args: Parameters<ToolImplementationOperations['acquire']>) {
    return this.operations.acquire(...args)
  }
}
export const runtimeRegistry = definePlugin({
  name: 'tool-runtime-registry',
  Config: z.object({}).strict(),
  apply(ctx: Context) {
    new RuntimeRegistry(ctx)
  },
})
export const implementationRegistry = definePlugin({
  name: 'tool-implementation-registry',
  Config: z.object({}).strict(),
  apply(ctx: Context) {
    new ImplementationRegistry(ctx)
  },
})

const RuntimeConfig = z
  .object({
    frameQueueBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    tailRetry: z
      .object({
        attempts: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
        minDelayMs: z.number().finite().min(0),
        maxDelayMs: z.number().finite().min(0),
      })
      .strict()
      .refine(value => value.minDelayMs <= value.maxDelayMs),
    resultStorage: z.string().min(1),
  })
  .strict()

export const managedRuntimeRegistry = Object.assign(
  definePlugin({
    name: 'tool-runtime-registry-managed',
    Config: z.object({}).strict(),
    inject: [ASSEMBLY_LIFETIME_SERVICE],
    apply(ctx) {
      startAssemblyWork(
        ctx,
        async () => {
          new RuntimeRegistry(ctx)
        },
        async () => {},
      )
    },
  }),
  {
    assemblyLifecycle: 1 as const,
    describeAssembly(value: unknown): AssemblyDeclaration {
      z.object({}).strict().parse(value)
      return {
        provides: [TOOL_RUNTIME_REGISTRY],
        requires: [],
        optional: [],
        dynamicProvides: [],
        dynamicRequires: [],
        claims: [],
      }
    },
  },
)

export const managedImplementationRegistry = Object.assign(
  definePlugin({
    name: 'tool-implementation-registry-managed',
    Config: z.object({}).strict(),
    inject: [ASSEMBLY_LIFETIME_SERVICE],
    apply(ctx) {
      startAssemblyWork(
        ctx,
        async () => {
          new ImplementationRegistry(ctx)
        },
        async () => {},
      )
    },
  }),
  {
    assemblyLifecycle: 1 as const,
    describeAssembly(value: unknown): AssemblyDeclaration {
      z.object({}).strict().parse(value)
      return {
        provides: [TOOL_IMPLEMENTATIONS],
        requires: [],
        optional: [],
        dynamicProvides: [],
        dynamicRequires: [],
        claims: [],
      }
    },
  },
)

const runtimeRequirements = [TOOL_RUNTIME_REGISTRY, TOOL_RUNTIME_STARTUP]

/** Managed initialization retains the original close control before awaiting recovery. */
export const managedToolExecutionLocal = Object.assign(
  definePlugin({
    name: 'tool-execution-local-managed',
    Config: RuntimeConfig,
    inject: [...runtimeRequirements, ASSEMBLY_LIFETIME_SERVICE],
    apply(ctx, config) {
      let owned: ReturnType<typeof createRetainedWork> | undefined
      let withdraw: (() => Promise<void>) | undefined
      startAssemblyWork(
        ctx,
        async () => {
          const startup = ctx.toolRuntimeStartup
          const instance = startup.start(config)
          owned = createRetainedWork(instance.ready, instance.close)
          // A failed handoff rejects managed readiness; the registered close still owns this instance.
          ctx.assemblyLifetime.retainClose(owned.control)
          startup.retainClose(owned.control)
          await instance.ready
          ctx.fiber.assertActive()
          if (!ctx.assemblyLifetime.isCurrent()) throw new Error('Assembly work has stopped')
          withdraw = ctx.toolRuntimeRegistry.register(instance.operations)
        },
        async () => {
          await withdraw?.()
          await owned?.work.close()
        },
      )
    },
  }),
  {
    assemblyLifecycle: 1 as const,
    describeAssembly(value: unknown): AssemblyDeclaration {
      RuntimeConfig.parse(value)
      return {
        provides: [],
        requires: runtimeRequirements,
        optional: [],
        dynamicProvides: [],
        dynamicRequires: [],
        claims: [],
      }
    },
  },
)
