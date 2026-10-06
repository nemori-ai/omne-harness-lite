import { symbols, type Context } from '@deepseek-ai/cordis'
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
  ToolRuntimeOperations,
  ToolImplementationOperations,
} from '@omne-harness-lite/tool-execution-runtime'
import { createToolRuntimeRegistry } from './registry.ts'
import { createToolImplementationRegistry } from './implementations.ts'
import { SESSION_ACCESS } from '@omne-harness-lite/session-tenancy/cordis'
import { SESSION_LOG_BACKING, SESSION_LOG_OWNER } from '@omne-harness-lite/session-log/cordis'
import { RUNTIME_CONTEXT } from '@omne-harness-lite/runtime-context/cordis'
import { EXECUTION_ENVIRONMENTS } from '@omne-harness-lite/execution-environments/cordis'
import { TOOL_ACTION_HISTORY, TOOL_ADMISSION } from '@omne-harness-lite/tool-admission/cordis'
import { RUNNER_HOST } from '@omne-harness-lite/loop-extension-runner/cordis'
import { CLOCK_SERVICE } from '@omne-harness-lite/offer-expiry/cordis'
import {
  TOOL_RUNTIME_REGISTRY,
  TOOL_IMPLEMENTATIONS,
  TOOL_RESULTS,
  TOOL_RUNTIME_STARTUP,
} from '@omne-harness-lite/tool-execution-runtime/cordis'
import type {
  ToolRuntimeConfig,
  ToolRuntimeBootstrap,
} from '@omne-harness-lite/tool-execution-runtime'
import {
  createParameterJudge,
  isToolReturn,
  type ToolReturn,
} from '@omne-harness-lite/tool-definition'
import { createToolInvoker } from './invoker.ts'
import { createToolRuntime } from './runtime.ts'

class RuntimeRegistry extends ToolRuntimeRegistryService {
  private readonly operations = createToolRuntimeRegistry()
  register(provider: ToolRuntimeOperations) {
    const dispose = this.ctx.effect(() => this.operations.register(provider))
    return async () => {
      await dispose()
    }
  }
  submit(...args: Parameters<ToolRuntimeOperations['submit']>) {
    return this.operations.submit(...args)
  }
  async acquire(
    ...args: Parameters<ToolRuntimeOperations['acquire']>
  ): ReturnType<ToolRuntimeOperations['acquire']> {
    // Install ownership before awaiting acquisition; caller disposal may win that race.
    let released = false
    let release: (() => void) | undefined
    this.ctx.effect(() => () => {
      released = true
      release?.()
    })
    const result = await this.operations.acquire(...args)
    if (result.kind !== 'acquired') return result
    release = result.observer.release
    if (released) {
      release()
      return { kind: 'rejected', reason: 'ownerStopped' }
    }
    return result
  }
  stop(...args: Parameters<ToolRuntimeOperations['stop']>) {
    return this.operations.stop(...args)
  }
  answer(...args: Parameters<ToolRuntimeOperations['answer']>) {
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

function createInstance(
  ctx: Context,
  config: ToolRuntimeConfig,
  recovery: ToolRuntimeBootstrap['recovery'],
) {
  return createToolRuntime(config, {
    recovery,
    backing: ctx.sessionLogBacking,
    owner: ctx.sessionLogOwner,
    history: ctx.toolActionHistory,
    authorization: ctx.sessionAccess,
    implementations: ctx.toolImplementations,
    context: ctx.runtimeContext,
    environments: ctx.executionEnvironments,
    results: ctx.toolResults,
    runnerHost: ctx.runnerHost,
    clock: ctx.clock,
    admission: () => {
      const current = ctx.get(TOOL_ADMISSION)
      // Cordis 4.0.4 returns a new caller proxy per get(). Compare its actual provider generation.
      return current ? (Reflect.get(current, symbols.original) ?? current) : undefined
    },
    invoke: createToolInvoker({
      parameters: createParameterJudge(),
      judgeResult: value =>
        isToolReturn(value) ? { kind: 'valid', result: value as ToolReturn } : { kind: 'invalid' },
    }),
  })
}

/** The app supplies its private maintenance token through construction, outside JSON configuration. */
export function toolExecutionLocal(bootstrap: ToolRuntimeBootstrap) {
  const recovery = bootstrap.recovery
  return definePlugin({
    name: 'tool-execution-local',
    inject: [
      TOOL_RUNTIME_REGISTRY,
      TOOL_IMPLEMENTATIONS,
      TOOL_RESULTS,
      SESSION_LOG_BACKING,
      SESSION_LOG_OWNER,
      SESSION_ACCESS,
      TOOL_ACTION_HISTORY,
      RUNTIME_CONTEXT,
      EXECUTION_ENVIRONMENTS,
      RUNNER_HOST,
      CLOCK_SERVICE,
    ],
    Config: RuntimeConfig,
    async apply(ctx, config) {
      const instance = createInstance(ctx, config, recovery)
      let closed = false,
        withdraw: (() => Promise<void>) | undefined
      ctx.effect(
        () => async () => {
          closed = true
          await withdraw?.()
          await instance.close()
        },
        'tool-execution-local.close',
      )
      await instance.ready
      if (!closed) withdraw = ctx.toolRuntimeRegistry.register(instance.operations)
    },
  })
}

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

const runtimeRequirements = [
  TOOL_RUNTIME_REGISTRY,
  TOOL_IMPLEMENTATIONS,
  TOOL_RESULTS,
  SESSION_LOG_BACKING,
  SESSION_LOG_OWNER,
  SESSION_ACCESS,
  TOOL_ACTION_HISTORY,
  RUNTIME_CONTEXT,
  EXECUTION_ENVIRONMENTS,
  RUNNER_HOST,
  CLOCK_SERVICE,
  TOOL_RUNTIME_STARTUP,
]

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
          const instance = createInstance(ctx, config, startup.recoveryAccess())
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
        dynamicRequires: [TOOL_ADMISSION],
        claims: [],
      }
    },
  },
)
