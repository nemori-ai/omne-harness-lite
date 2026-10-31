// PACKAGE_TEMPLATE_DRAFT: The registry Service, the files declaration plugin and the host files plugin are in place; the Runtime Context producer plugin, the command and terminal providers are not yet accepted.
import type { Context } from '@deepseek-ai/cordis'
import {
  createEnvironmentRegistry,
  RetirementPending,
  type EnvironmentRegistry,
} from '@omne-harness/execution-environment'
import {
  filesFacility,
  type EnvironmentAuthority,
  type EnvironmentProvider,
  type ExecutionEnvironment,
  type FacilityDescriptor,
  type FacilityKey,
  type ProviderRegistrations,
  type RecoveryAuthority,
} from '@omne-harness/execution-environment-contract'
import type { ScopeBindingSource } from '@omne-harness/runtime-context-contract'
import {
  ExecutionEnvironmentService,
  executionEnvironmentAuthorityKey,
  executionEnvironmentKey,
  executionRecoveryAuthorityKey,
  executionScopeBindingKey,
} from '@omne-harness/execution-environment-cordis-contract/cordis'
import type { HostFilesDomain } from './host-domain.ts'
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

/** Configuration of the host files plugin. An absent field takes the provider's initial value. */
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
 * `executionRecoveryAuthority` service, and ordinary access asks the `executionEnvironmentAuthority`
 * and `executionScopeBinding` services, each read from this Service's own load context at the time
 * of each use; without one, the answer is `unavailable`, never a pass. On unload it closes the registry: new leases are refused first, then
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
    const authority: EnvironmentAuthority<P> = {
      async authorize(access, action) {
        const port = ctx.get(executionEnvironmentAuthorityKey)
        if (port === undefined) return { kind: 'unavailable' }
        const decision = await port.authorize(access, action)
        // The Context property carries an unknown principal; the registry reads only the kind and
        // the current() premise, so the principal is restated as the caller's.
        return decision.kind === 'authorized'
          ? { kind: 'authorized', principal: access.principal, current: () => decision.current() }
          : decision
      },
    }
    const bindings: ScopeBindingSource = {
      async lookup(scope) {
        const source = ctx.get(executionScopeBindingKey)
        if (source === undefined) return { kind: 'unavailable' }
        return source.lookup(scope)
      },
    }
    const registry = createEnvironmentRegistry<P>({ recovery, authority, bindings })
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

  protected onResolvePlacement(
    ...args: Operation<P, 'resolvePlacement'>['args']
  ): Operation<P, 'resolvePlacement'>['result'] {
    return this.registry.resolvePlacement(...args)
  }
  protected onAcquire(...args: Operation<P, 'acquire'>['args']): Operation<P, 'acquire'>['result'] {
    return this.registry.acquire(...args)
  }
  protected onInspectAcquisition(
    ...args: Operation<P, 'inspectAcquisition'>['args']
  ): Operation<P, 'inspectAcquisition'>['result'] {
    return this.registry.inspectAcquisition(...args)
  }
  protected onInspectRecoveryAcquisition(
    ...args: Operation<P, 'inspectRecoveryAcquisition'>['args']
  ): Operation<P, 'inspectRecoveryAcquisition'>['result'] {
    return this.registry.inspectRecoveryAcquisition(...args)
  }
  protected onDescribe(
    ...args: Operation<P, 'describe'>['args']
  ): Operation<P, 'describe'>['result'] {
    return this.registry.describe(...args)
  }
  protected onRecoverOwned(
    ...args: Operation<P, 'recoverOwned'>['args']
  ): Operation<P, 'recoverOwned'>['result'] {
    return this.registry.recoverOwned(...args)
  }
  protected onReleaseScope(
    ...args: Operation<P, 'releaseScope'>['args']
  ): Operation<P, 'releaseScope'>['result'] {
    return this.registry.releaseScope(...args)
  }

  /** Registers on the caller's fiber: the descriptor goes away when the caller unloads. */
  protected onRegisterFacility<K extends FacilityKey>(
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
  protected onRegisterProvider(
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
  inject: { [executionEnvironmentKey]: { caller: 'provider' } },
  apply(ctx: Context) {
    ctx.executionEnvironment.registerFacility(filesFacility)
  },
}

/**
 * Makes the plugin that registers one host files provider of `domain` on the loading fiber. The
 * process host creates the domain once and keeps it; unloading the plugin retires the provider
 * generation, not the domain, so a reloaded plugin sees the original quota use and acquisitions.
 * The `files` declaration comes from `filesFacilityPlugin`; without it, acquisitions that need
 * `files` are refused. `drainBoundMs` bounds how long a release, a settlement or the retirement
 * waits for file operations in flight; a pending result writes one error to `ctx.logger`.
 */
export function createHostFilesPlugin(domain: HostFilesDomain) {
  return {
    name: 'hostFiles',
    Config: hostFilesConfig,
    inject: { [executionEnvironmentKey]: { caller: 'provider' } },
    apply(ctx: Context, config: HostFilesConfig = {}) {
      const logger = ctx.logger('executionEnvironment.hostFiles')
      const options: HostFilesProviderOptions = {
        ...config,
        domain,
        diagnose: diagnostic => logger.error(diagnostic),
      }
      ctx.executionEnvironment.registerProvider(createHostFilesProvider(options))
    },
  }
}
