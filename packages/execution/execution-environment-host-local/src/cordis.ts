// PACKAGE_TEMPLATE_DRAFT: The registry Service and the host files plugin are in place; the Runtime Context producer plugin, the command and terminal providers and caller-class enforcement are not yet accepted.
import type { Context } from '@deepseek-ai/cordis'
import {
  createEnvironmentRegistry,
  RetirementPending,
  type EnvironmentRegistry,
} from '@omne-harness/execution-environment'
import {
  filesFacility,
  type EnvironmentProvider,
  type ExecutionEnvironment,
  type FacilityDescriptor,
  type FacilityKey,
  type ProviderRegistrations,
  type RecoveryAuthority,
} from '@omne-harness/execution-environment-contract'
import {
  ExecutionEnvironmentService,
  executionEnvironmentKey,
} from '@omne-harness/execution-environment-cordis-contract/cordis'
import { createHostFilesProvider } from './host-provider.ts'

/** A Standard Schema that accepts only an absent or empty configuration. */
type EmptyConfig = {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    validate(
      value: unknown,
    ): { readonly value: object } | { readonly issues: readonly { readonly message: string }[] }
  }
}

const emptyConfig: EmptyConfig = {
  '~standard': {
    version: 1,
    vendor: 'omne-harness',
    validate(value: unknown) {
      if (value == null) return { value: {} }
      if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)
        return { value: {} }
      return { issues: [{ message: 'configuration accepts no fields' }] }
    },
  },
}

/** Used when the assembly gives no recovery authority: every recovery request is `unavailable`. */
export const unavailableRecoveryAuthority: RecoveryAuthority = Object.freeze({
  async authorizeRecovery(): Promise<'unavailable'> {
    return 'unavailable'
  },
})

type Operation<P, O extends keyof ExecutionEnvironment<P>> = {
  args: Parameters<ExecutionEnvironment<P>[O]>
  result: ReturnType<ExecutionEnvironment<P>[O]>
}

/**
 * The `executionEnvironment` Service backed by the Cordis-free registry. On unload it refuses new
 * leases first, then retires every provider; a retirement that leaves resources behind fails the
 * unload instead of reporting completion.
 */
export class ExecutionEnvironmentRegistry<P> extends ExecutionEnvironmentService<P> {
  static readonly Config = emptyConfig
  private readonly registry: EnvironmentRegistry<P>

  constructor(
    ctx: Context,
    _config: unknown = {},
    recovery: RecoveryAuthority = unavailableRecoveryAuthority,
  ) {
    super(ctx)
    const registry = createEnvironmentRegistry<P>({ recovery })
    this.registry = registry
    ctx.effect(
      () => async () => {
        const closed = await registry.close()
        if (closed.kind === 'pending')
          throw new RetirementPending('The environment registry', closed.resources)
      },
      'executionEnvironment.close',
    )
  }

  resolvePlacement(
    ...args: Operation<P, 'resolvePlacement'>['args']
  ): Operation<P, 'resolvePlacement'>['result'] {
    return this.registry.resolvePlacement(...args)
  }
  acquire(...args: Operation<P, 'acquire'>['args']): Operation<P, 'acquire'>['result'] {
    return this.registry.acquire(...args)
  }
  inspectAcquisition(
    ...args: Operation<P, 'inspectAcquisition'>['args']
  ): Operation<P, 'inspectAcquisition'>['result'] {
    return this.registry.inspectAcquisition(...args)
  }
  describe(...args: Operation<P, 'describe'>['args']): Operation<P, 'describe'>['result'] {
    return this.registry.describe(...args)
  }
  recoverOwned(
    ...args: Operation<P, 'recoverOwned'>['args']
  ): Operation<P, 'recoverOwned'>['result'] {
    return this.registry.recoverOwned(...args)
  }
  releaseScope(
    ...args: Operation<P, 'releaseScope'>['args']
  ): Operation<P, 'releaseScope'>['result'] {
    return this.registry.releaseScope(...args)
  }

  /** Registers on the caller's fiber: the descriptor goes away when the caller unloads. */
  registerFacility<K extends FacilityKey>(
    descriptor: FacilityDescriptor<K>,
  ): ReturnType<ProviderRegistrations['registerFacility']> {
    const dispose = this.ctx.effect(
      () => this.registry.registerFacility(descriptor),
      `executionEnvironment.registerFacility(${descriptor.key})`,
    )
    return () => Promise.resolve(dispose())
  }

  /** Registers on the caller's fiber: the provider retires when the caller unloads. */
  registerProvider(
    provider: EnvironmentProvider,
  ): ReturnType<ProviderRegistrations['registerProvider']> {
    const dispose = this.ctx.effect(
      () => this.registry.registerProvider(provider),
      `executionEnvironment.registerProvider(${provider.name})`,
    )
    return () => Promise.resolve(dispose())
  }
}

/** A registry plugin whose recovery operations ask the given authority. */
export function executionEnvironmentRegistryWith(recovery: RecoveryAuthority) {
  return {
    name: 'executionEnvironmentRegistry',
    Config: emptyConfig,
    apply(ctx: Context) {
      new ExecutionEnvironmentRegistry(ctx, {}, recovery)
    },
  }
}

/** Registers the `files` descriptor and the host files provider on the loading fiber. */
export const hostFilesPlugin = {
  name: 'hostFiles',
  Config: emptyConfig,
  inject: [executionEnvironmentKey],
  apply(ctx: Context) {
    ctx.executionEnvironment.registerFacility(filesFacility)
    ctx.executionEnvironment.registerProvider(createHostFilesProvider())
  },
}
