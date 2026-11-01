import { Context, Service } from '@deepseek-ai/cordis'
import type {
  ConsumerClass,
  ContextBlockKey,
  ProducerHandle,
  ProducerRegistration,
  RegisterProducerResult,
} from '@omne-harness/runtime-context-contract'
import {
  createRuntimeContext,
  resolveRuntimeContextConfig,
  type RuntimeContextConfig,
  type RuntimeContextDiagnostic,
  type RuntimeContextMechanism,
  type RuntimeContextOptions,
} from '@omne-harness/runtime-context'
import {
  RuntimeContextService,
  runtimeContextScopeKey,
  runtimeContextTrustKey,
} from '@omne-harness/runtime-context-cordis-contract/cordis'

/** Where the provider writes mechanism diagnostics; `off` drops them. */
export type RuntimeContextDiagnosticsLevel = 'off' | 'debug' | 'info' | 'warn'

/** Plugin configuration: the mechanism bounds plus the diagnostics level. Every field may be omitted. */
export type RuntimeContextPluginConfig = RuntimeContextConfig &
  Readonly<{ diagnostics?: RuntimeContextDiagnosticsLevel }>

/** The mechanism factory; a test may replace it, the product uses runtime-context's one factory. */
export type RuntimeContextMechanismFactory = (
  options: RuntimeContextOptions<unknown>,
) => RuntimeContextMechanism<unknown>

const BOUND_FIELDS = [
  'retention',
  'replayCapacity',
  'supplyBoundMs',
  'settleBoundMs',
  'readCacheEntries',
  'refreshConcurrency',
  'refreshRetryMs',
] as const satisfies readonly (keyof RuntimeContextConfig)[]

const LEVELS = [
  'off',
  'debug',
  'info',
  'warn',
] as const satisfies readonly RuntimeContextDiagnosticsLevel[]

const CONSUMERS = [
  'model',
  'tool',
  'extension',
  'coordinator',
] as const satisfies readonly ConsumerClass[]

type Issue = Readonly<{ message: string; path?: readonly string[] }>
type Parsed =
  | Readonly<{ value: RuntimeContextPluginConfig }>
  | Readonly<{ issues: readonly Issue[] }>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLevel(value: unknown): value is RuntimeContextDiagnosticsLevel {
  return LEVELS.some(level => level === value)
}

function isConsumer(value: unknown): value is ConsumerClass {
  return CONSUMERS.some(consumer => consumer === value)
}

function isBoundField(name: string): name is (typeof BOUND_FIELDS)[number] {
  return BOUND_FIELDS.some(field => field === name)
}

/**
 * The plugin's Standard Schema validation. Unknown fields are refused so that a misspelled bound
 * fails the load instead of silently keeping its initial value. The bounds themselves are decided
 * by runtime-context's resolver, not here.
 */
function parseConfig(value: unknown): Parsed {
  if (value === undefined || value === null) return { value: {} }
  if (!isRecord(value)) return { issues: [{ message: 'configuration must be an object' }] }
  const bounds: Record<string, number> = {}
  let diagnostics: RuntimeContextDiagnosticsLevel | undefined
  for (const [name, field] of Object.entries(value)) {
    if (field === undefined) continue
    if (name === 'diagnostics') {
      if (!isLevel(field))
        return {
          issues: [{ message: `diagnostics must be one of ${LEVELS.join(', ')}`, path: [name] }],
        }
      diagnostics = field
    } else if (isBoundField(name)) {
      if (typeof field !== 'number')
        return { issues: [{ message: `${name} must be a number`, path: [name] }] }
      bounds[name] = field
    } else return { issues: [{ message: `unknown field ${name}`, path: [name] }] }
  }
  try {
    resolveRuntimeContextConfig(bounds)
  } catch (error) {
    return { issues: [{ message: error instanceof RangeError ? error.message : 'invalid bound' }] }
  }
  return { value: { ...bounds, ...(diagnostics ? { diagnostics } : {}) } }
}

const configSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'runtime-context-cordis',
    validate: parseConfig,
  },
}

function boundsOf(config: RuntimeContextPluginConfig): RuntimeContextConfig {
  const bounds: Record<string, number> = {}
  for (const field of BOUND_FIELDS) {
    const value = config[field]
    if (value !== undefined) bounds[field] = value
  }
  return bounds
}

/**
 * The Runtime Context provider. It takes the two original ports from `runtimeContextTrust`, builds
 * one mechanism, forwards the eight operations, and adds the Cordis duties: the producer
 * registration is an effect on the calling fiber, `bind` compares the caller's intercept consumer
 * class, the change outlet dispatches the scope-filtered wake-up, and unloading closes the mechanism.
 */
export class RuntimeContextProvider extends RuntimeContextService<unknown> {
  static readonly inject = [runtimeContextTrustKey]
  static readonly Config = configSchema

  readonly registerProducer: RuntimeContextService<unknown>['registerProducer']
  readonly prepareRegistration: RuntimeContextService<unknown>['prepareRegistration']
  readonly issueEligibility: RuntimeContextService<unknown>['issueEligibility']
  readonly revokeEligibility: RuntimeContextService<unknown>['revokeEligibility']
  readonly applyCommit: RuntimeContextService<unknown>['applyCommit']
  readonly beginReplay: RuntimeContextService<unknown>['beginReplay']
  readonly finishReplay: RuntimeContextService<unknown>['finishReplay']
  readonly bind: RuntimeContextService<unknown>['bind']

  constructor(
    ctx: Context,
    config: RuntimeContextPluginConfig = {},
    make: RuntimeContextMechanismFactory = createRuntimeContext,
  ) {
    super(ctx)
    const level = config.diagnostics ?? 'debug'
    const logger = ctx.logger('runtime-context')
    const { authority, bindings } = ctx.runtimeContextTrust
    // The mechanism lives only in these closures. Cordis hands callers an extended instance, and
    // `#private` fields fail through it; a plain field would expose the mechanism past `bind`.
    const mechanism = make({
      trust: { authority, bindings },
      config: boundsOf(config),
      onChange: (scope, revision) => {
        const dispatch = ctx.extend({
          [Context.filter]: (target: Context) => target[runtimeContextScopeKey]?.ref === scope.ref,
        })
        // A throwing listener propagates to the mechanism's outlet guard, which diagnoses it; the
        // write stands and the wake-up is only a hint.
        ctx.emit(dispatch, 'runtime-context-cordis-contract/changed', scope, revision)
      },
      ...(level === 'off'
        ? {}
        : {
            diagnose: (event: RuntimeContextDiagnostic) => {
              logger[level]('runtime-context diagnostic %o', event)
            },
          }),
    })
    ctx.effect(() => () => mechanism.close(), 'runtimeContext.close')

    this.registerProducer = async function <K extends ContextBlockKey>(
      this: RuntimeContextProvider,
      principal: unknown,
      registration: ProducerRegistration<K, unknown>,
    ): Promise<RegisterProducerResult<K>> {
      // `this.ctx` is the calling producer's context; capture it before the first await.
      const caller = this.ctx
      const result = await mechanism.registerProducer<K>(principal, registration)
      if (result.kind !== 'registered') return result
      const handle = result.handle
      let release: () => unknown
      try {
        release = caller.effect(() => () => handle.dispose(), 'runtimeContext.registerProducer')
      } catch {
        // The calling fiber ended while the registration was in flight: no effect can own the
        // registration, so withdraw it now and answer as a closed registrant.
        await handle.dispose()
        return { kind: 'rejected', reason: 'closed' }
      }
      return { kind: 'registered', handle: withRelease(handle, release) }
    }
    this.prepareRegistration = (...args) => mechanism.prepareRegistration(...args)
    this.issueEligibility = (...args) => mechanism.issueEligibility(...args)
    this.revokeEligibility = (...args) => mechanism.revokeEligibility(...args)
    this.applyCommit = (...args) => mechanism.applyCommit(...args)
    this.beginReplay = (...args) => mechanism.beginReplay(...args)
    this.finishReplay = (...args) => mechanism.finishReplay(...args)
    this.bind = function (this: RuntimeContextProvider, eligibility) {
      const declared: unknown = this[Service.resolveConfig]().consumer
      return mechanism.bind(eligibility, isConsumer(declared) ? { consumer: declared } : {})
    }
  }
}

/** The handle the producer sees: disposing it runs the effect, so the fiber drops the disposer too. */
function withRelease<K extends ContextBlockKey>(
  handle: ProducerHandle<K>,
  release: () => unknown,
): ProducerHandle<K> {
  return {
    key: handle.key,
    tenant: handle.tenant,
    producer: handle.producer,
    generation: handle.generation,
    publish: input => handle.publish(input),
    invalidate: target => handle.invalidate(target),
    dispose: async () => {
      await release()
    },
  }
}

/**
 * The plugin entry. Without options it is the provider with runtime-context's factory. The
 * `mechanism` option replaces the factory, for tests only.
 */
export function createRuntimeContextPlugin(
  options: Readonly<{ mechanism?: RuntimeContextMechanismFactory }> = {},
): typeof RuntimeContextProvider {
  const make = options.mechanism
  if (!make) return RuntimeContextProvider
  return class RuntimeContextTestProvider extends RuntimeContextProvider {
    constructor(ctx: Context, config: RuntimeContextPluginConfig = {}) {
      super(ctx, config, make)
    }
  }
}
