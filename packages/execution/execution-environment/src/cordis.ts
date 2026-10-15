import { Context, Service } from '@deepseek-ai/cordis'
import { createHostFiles } from './host-files.ts'
import type {
  EnvironmentContinuity,
  EnvironmentProvider,
  ExecutionEnvironment,
  PlacementInput,
} from './model.ts'

const liveProviders = Symbol.for('omne.executionEnvironment.providers')

const emptyConfig = {
  '~standard': {
    version: 1 as const,
    vendor: 'omne-harness',
    validate(value: unknown) {
      if (value == null) return { value: {} }
      if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
        return { value: {} }
      }
      return { issues: [{ message: 'configuration accepts no fields' }] }
    },
  },
}

type RegistryRecord = { [liveProviders]?: EnvironmentProvider[] }

function providersOf(service: object): EnvironmentProvider[] {
  const list = (service as RegistryRecord)[liveProviders]
  if (!list) throw new Error('execution environment registry has no provider list')
  return list
}

/**
 * @owner packages/execution/execution-environment
 */
export abstract class ExecutionEnvironmentService extends Service implements ExecutionEnvironment {
  static readonly provide = 'executionEnvironment'

  constructor(ctx: Context) {
    super(ctx, ExecutionEnvironmentService.provide)
  }

  abstract resolvePlacement(input: PlacementInput): ReturnType<ExecutionEnvironment['resolvePlacement']>
  abstract acquire(input: PlacementInput): ReturnType<ExecutionEnvironment['acquire']>
  abstract registerProvider(provider: EnvironmentProvider): ReturnType<ExecutionEnvironment['registerProvider']>
}

export const EXECUTION_ENVIRONMENT = ExecutionEnvironmentService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    executionEnvironment: ExecutionEnvironmentService
  }
}

const hostContinuity: EnvironmentContinuity = { kind: 'not_guaranteed' }

function hostFileProvider(): EnvironmentProvider {
  const files = createHostFiles()
  return {
    name: 'host-files',
    bindingKinds: ['host_machine'],
    facilities: new Map([['files', files]]),
    async acquire(placement) {
      if (placement.binding.kind !== 'host_machine') return { kind: 'rejected', reason: 'missingFacility' }
      return {
        kind: 'acquired',
        lease: {
          binding: placement.binding,
          continuity: placement.continuity,
          instance: { id: 'host', generation: '1' },
          facility(name) {
            return name === 'files' ? files : undefined
          },
          async release() {
            return { kind: 'released' }
          },
        },
      }
    },
  }
}

export class ExecutionEnvironmentRegistry extends ExecutionEnvironmentService {
  static readonly Config = emptyConfig

  constructor(ctx: Context) {
    super(ctx)
    Object.defineProperty(this, liveProviders, { value: [] as EnvironmentProvider[] })
  }

  async resolvePlacement(input: PlacementInput) {
    const matched = providersOf(this).some((provider) => provider.bindingKinds.includes(input.binding.kind))
    if (!matched) return { kind: 'rejected' as const, reason: 'noMatchingEnvironment' as const }
    return { kind: 'placement' as const, binding: input.binding, continuity: hostContinuity }
  }

  async acquire(input: PlacementInput) {
    const layer = providersOf(this).filter((provider) => provider.bindingKinds.includes(input.binding.kind))
    if (layer.length === 0) return { kind: 'rejected' as const, reason: 'noMatchingEnvironment' as const }
    const provider = layer.find((candidate) => input.facilities.every((name) => candidate.facilities.has(name)))
    if (!provider) return { kind: 'rejected' as const, reason: 'missingFacility' as const }
    return provider.acquire({
      binding: input.binding,
      continuity: hostContinuity,
      tenantId: input.tenantId,
      callId: input.callId,
    })
  }

  registerProvider(provider: EnvironmentProvider) {
    return this.ctx.effect(() => {
      const providers = providersOf(this)
      providers.push(provider)
      return () => {
        const index = providers.indexOf(provider)
        if (index >= 0) providers.splice(index, 1)
      }
    })
  }
}

export const hostFilesPlugin = {
  name: 'hostFiles',
  Config: emptyConfig,
  inject: [EXECUTION_ENVIRONMENT],
  apply(ctx: Context) {
    ctx.executionEnvironment.registerProvider(hostFileProvider())
  },
}
