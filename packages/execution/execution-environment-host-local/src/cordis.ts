// PACKAGE_TEMPLATE_DRAFT: The registry Service, the files declaration plugin and the host files plugin are in place; the Runtime Context producer plugin, the command and terminal providers and caller-class enforcement are not yet accepted.
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
  executionRecoveryAuthorityKey,
} from '@omne-harness/execution-environment-cordis-contract/cordis'
import { createHostFilesProvider, type HostFilesProviderOptions } from './host-provider.ts'

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

/** Configuration of `hostFilesPlugin`. An absent field takes the provider's initial value. */
export type HostFilesConfig = Readonly<{ drainBoundMs?: number }>

type ConfigResult<T> =
  | { readonly value: T }
  | { readonly issues: readonly { readonly message: string }[] }

type HostFilesConfigSchema = {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    validate(value: unknown): ConfigResult<HostFilesConfig>
  }
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Accepts an absent or empty configuration, or `drainBoundMs` as a finite number zero or more. */
const hostFilesConfig: HostFilesConfigSchema = {
  '~standard': {
    version: 1,
    vendor: 'omne-harness',
    validate(value: unknown): ConfigResult<HostFilesConfig> {
      if (value == null) return { value: {} }
      if (!isPlainRecord(value)) return { issues: [{ message: 'configuration must be an object' }] }
      const unknownKey = Object.keys(value).find(key => key !== 'drainBoundMs')
      if (unknownKey !== undefined)
        return { issues: [{ message: `configuration has no field ${unknownKey}` }] }
      const bound = value['drainBoundMs']
      if (bound === undefined) return { value: {} }
      if (typeof bound !== 'number' || !Number.isFinite(bound) || bound < 0)
        return { issues: [{ message: 'drainBoundMs must be a finite number, zero or more' }] }
      return { value: { drainBoundMs: bound } }
    },
  },
}

type Operation<P, O extends keyof ExecutionEnvironment<P>> = {
  args: Parameters<ExecutionEnvironment<P>[O]>
  result: ReturnType<ExecutionEnvironment<P>[O]>
}

/**
 * The `executionEnvironment` Service backed by the Cordis-free registry. Recovery asks the
 * `executionRecoveryAuthority` service read at the time of each recovery operation; without one,
 * recovery is `unavailable`. On unload it closes the registry: new leases are refused first, then
 * every provider retires. The unload itself always completes. When the close is pending, the
 * removal throws `RetirementPending` with the resources not yet stopped, and Cordis writes that
 * error to `ctx.logger`; the unload does not fail.
 */
export class ExecutionEnvironmentRegistry<P> extends ExecutionEnvironmentService<P> {
  static readonly Config = emptyConfig
  private readonly registry: EnvironmentRegistry<P>

  constructor(ctx: Context) {
    super(ctx)
    // Read on each use (IC-9): the authority may come, go or be replaced while the registry runs.
    const recovery: RecoveryAuthority = {
      async authorizeRecovery(access, scope, resources) {
        const authority = ctx.get(executionRecoveryAuthorityKey)
        if (authority === undefined) return 'unavailable'
        return authority.authorizeRecovery(access, scope, resources)
      },
    }
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

  /**
   * Registers on the caller's fiber: the provider retires when the caller unloads. The returned
   * removal calls the registry's removal itself, so it can be retried after `RetirementPending`;
   * the Cordis effect only calls that removal once, when the caller's fiber unloads.
   */
  registerProvider(
    provider: EnvironmentProvider,
  ): ReturnType<ProviderRegistrations['registerProvider']> {
    let remove: () => Promise<void> = async () => undefined
    this.ctx.effect(() => {
      remove = this.registry.registerProvider(provider)
      return () => remove()
    }, `executionEnvironment.registerProvider(${provider.name})`)
    return () => remove()
  }
}

/** Registers the `files` facility declaration on the loading fiber. It registers no provider. */
export const filesFacilityPlugin = {
  name: 'filesFacility',
  Config: emptyConfig,
  inject: [executionEnvironmentKey],
  apply(ctx: Context) {
    ctx.executionEnvironment.registerFacility(filesFacility)
  },
}

/**
 * Registers one host files provider on the loading fiber. The `files` declaration comes from
 * `filesFacilityPlugin`; without it, acquisitions that need `files` are refused. `drainBoundMs`
 * bounds how long the provider's retirement waits for file operations in flight; a retirement past
 * the bound is pending and writes one error with the count still in flight to `ctx.logger`.
 */
export const hostFilesPlugin = {
  name: 'hostFiles',
  Config: hostFilesConfig,
  inject: [executionEnvironmentKey],
  apply(ctx: Context, config: HostFilesConfig = {}) {
    const logger = ctx.logger('executionEnvironment.hostFiles')
    const options: HostFilesProviderOptions = {
      ...config,
      diagnose: diagnostic => logger.error(diagnostic),
    }
    ctx.executionEnvironment.registerProvider(createHostFilesProvider(options))
  },
}
