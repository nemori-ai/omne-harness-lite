import {
  ASSEMBLY_LIFETIME_SERVICE,
  startRetainedAssemblyWork,
} from '@omne-harness-lite/assembly-lifecycle/cordis'
import type { AssemblyDeclaration } from '@omne-harness-lite/cordis-plugin-tree'
import type { Context } from '@deepseek-ai/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import {
  ExecutionEnvironmentsService,
  EXECUTION_ENVIRONMENTS,
  RESOURCE_RECOVERY_AUTHORITY,
} from '@omne-harness-lite/execution-environments/cordis'
import type {
  ExecutionEnvironmentOperations,
  EnvironmentProviderRegistrations,
  EnvironmentPlacementRegistrations,
} from '@omne-harness-lite/execution-environments'
import { SESSION_ACCESS } from '@omne-harness-lite/session-tenancy/cordis'
import { z } from 'zod'
import { createEnvironmentRegistry } from './registry.ts'
import { createNativeStore } from './native-store.ts'
import { createHostEnvironment } from './host.ts'
import { STORAGE_SERVICE } from '@omne-harness-lite/storage/cordis'
import { defaultHostNativePolicy } from './native-policy.ts'
const hostPolicy = z
  .object({
    output: z
      .object({
        maxBufferedBytes: z.number().int().positive(),
        maxChunkBytes: z.number().int().positive(),
        overflow: z.literal('discard'),
      })
      .strict(),
    commandDeadlineMs: z.number().int().positive(),
    preparationDeadlineMs: z.number().int().positive(),
    stopDeadlineMs: z.number().int().positive(),
    maxInputBytes: z.number().int().positive(),
    maxTerminalsPerScope: z.number().int().positive(),
    fileReadBytes: z.number().int().positive(),
    fileWriteBytes: z.number().int().positive(),
    maxBatchEntries: z.number().int().positive(),
    maxBatchBytes: z.number().int().positive(),
    pageEntries: z.number().int().positive(),
    maxPageEntries: z.number().int().positive(),
    searchNodes: z.number().int().positive(),
    searchBytes: z.number().int().positive(),
  })
  .strict()
const hostConfig = z.object({ provider: z.string().min(1), policy: hostPolicy.optional() }).strict()
class Registry extends ExecutionEnvironmentsService {
  constructor(
    ctx: Context,
    private readonly owner: ReturnType<typeof createEnvironmentRegistry>,
  ) {
    super(ctx)
  }
  describe(...args: Parameters<ExecutionEnvironmentOperations['describe']>) {
    return this.owner.operations.describe(...args)
  }
  resolvePlacement(...args: Parameters<ExecutionEnvironmentOperations['resolvePlacement']>) {
    return this.owner.operations.resolvePlacement(...args)
  }
  acquire(...args: Parameters<ExecutionEnvironmentOperations['acquire']>) {
    return this.owner.operations.acquire(...args)
  }
  recoverOwned(...args: Parameters<EnvironmentProviderRegistrations['recoverOwned']>) {
    return this.owner.registrations.recoverOwned(...args)
  }
  recover(...args: Parameters<EnvironmentProviderRegistrations['recover']>) {
    return this.owner.registrations.recover(...args)
  }
  registerPlacementSource(
    ...args: Parameters<EnvironmentPlacementRegistrations['registerPlacementSource']>
  ) {
    const dispose = this.ctx.effect(() => this.owner.placements.registerPlacementSource(...args))
    return async () => {
      await dispose()
    }
  }
  registerProvider(...args: Parameters<EnvironmentProviderRegistrations['registerProvider']>) {
    const dispose = this.ctx.effect(() => this.owner.registrations.registerProvider(...args))
    return async () => {
      await dispose()
    }
  }
}
export const environmentRegistry = definePlugin({
  name: 'environment-registry',
  inject: [SESSION_ACCESS, RESOURCE_RECOVERY_AUTHORITY],
  Config: z.object({}).strict(),
  apply(ctx) {
    const owner = createEnvironmentRegistry({
      access: ctx.sessionAccess,
      recovery: ctx.resourceRecoveryAuthority,
    })
    ctx.effect(() => owner.close)
    new Registry(ctx, owner)
  },
})
export const hostEnvironment = Object.assign(
  definePlugin({
    name: 'host-environment',
    inject: [EXECUTION_ENVIRONMENTS, SESSION_ACCESS, STORAGE_SERVICE, ASSEMBLY_LIFETIME_SERVICE],
    Config: hostConfig,
    apply(ctx, config) {
      let provider: ReturnType<typeof createHostEnvironment> | undefined
      let remove: (() => Promise<void>) | undefined
      startRetainedAssemblyWork(
        ctx,
        async () => {
          await createNativeStore(ctx.storage, config.provider).verify()
          provider = createHostEnvironment({
            name: config.provider,
            access: ctx.sessionAccess,
            storage: ctx.storage,
            policy: config.policy ?? defaultHostNativePolicy,
          })
          remove = ctx.executionEnvironments.registerProvider(provider)
        },
        async () => {
          await remove?.()
        },
      )
    },
  }),
  {
    assemblyLifecycle: 1 as const,
    describeAssembly(value: unknown): AssemblyDeclaration {
      hostConfig.parse(value)
      return {
        provides: [],
        requires: [EXECUTION_ENVIRONMENTS, SESSION_ACCESS, STORAGE_SERVICE],
        optional: [],
        dynamicProvides: [],
        dynamicRequires: [],
        claims: [],
      }
    },
  },
)

export const managedEnvironmentRegistry = Object.assign(
  definePlugin({
    name: 'environment-registry-managed',
    inject: [SESSION_ACCESS, RESOURCE_RECOVERY_AUTHORITY, ASSEMBLY_LIFETIME_SERVICE],
    Config: z.object({}).strict(),
    apply(ctx) {
      let owner: ReturnType<typeof createEnvironmentRegistry> | undefined
      startRetainedAssemblyWork(
        ctx,
        async () => {
          owner = createEnvironmentRegistry({
            access: ctx.sessionAccess,
            recovery: ctx.resourceRecoveryAuthority,
          })
          new Registry(ctx, owner)
        },
        async () => {
          await owner?.close()
        },
      )
    },
  }),
  {
    assemblyLifecycle: 1 as const,
    describeAssembly(value: unknown): AssemblyDeclaration {
      z.object({}).strict().parse(value)
      return {
        provides: [EXECUTION_ENVIRONMENTS],
        requires: [SESSION_ACCESS, RESOURCE_RECOVERY_AUTHORITY],
        optional: [],
        dynamicProvides: [],
        dynamicRequires: [],
        claims: [],
      }
    },
  },
)
