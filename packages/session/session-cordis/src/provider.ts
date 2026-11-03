// The concrete subclass of `SessionService`, which is also the plugin (SPEC properties 1 and 2).
// The abstract class registers the key `session`; this class writes no key and does not call
// `ctx.provide`. State lives in `runtime` and not in `#private` fields, because a caller reads
// the service through an extended copy of it and `#private` fields fail through that copy.
import { Service, type Context } from '@deepseek-ai/cordis'
import type { SessionMeasure } from '@omne-harness/session'
import type { SessionFaces } from '@omne-harness/session-contract'
import {
  SessionService,
  sessionAccessCheckKey,
  sessionDelegatedTransactionsKey,
  sessionPrincipalsKey,
  sessionWorkPrincipalsKey,
} from '@omne-harness/session-cordis-contract/cordis'
import { assemblyLifecycleKey } from './assembly-lifecycle.ts'
import {
  resolveProviderConfig,
  sessionProviderConfigSchema,
  type SessionProviderConfig,
} from './config.ts'
import { callerClassOf } from './faces.ts'
import { startProvider, type ProviderRuntime } from './runtime.ts'

/**
 * The caller class that `service` was read for. `this.ctx` of a property read is the Context of
 * the caller, and its intercept configuration holds `{ caller }` when the caller declared it.
 */
function callerOf(service: SessionService<unknown>) {
  try {
    return callerClassOf(service[Service.resolveConfig]())
  } catch {
    return null
  }
}

export class SessionProvider extends SessionService<unknown> {
  // Five keys: a change of any of their providers unloads the plugin and runs it again. The other
  // ports are read per call. The last key is private (IC-8 deviation, see assembly-lifecycle.ts).
  static readonly inject = [
    sessionAccessCheckKey,
    sessionDelegatedTransactionsKey,
    sessionPrincipalsKey,
    sessionWorkPrincipalsKey,
    assemblyLifecycleKey,
  ]
  static readonly Config = sessionProviderConfigSchema

  private readonly runtime: ProviderRuntime

  /** `measure` is the observer of the measurement events; only the plugin factory hands it in. */
  constructor(ctx: Context, config: SessionProviderConfig = {}, measure?: SessionMeasure) {
    super(ctx)
    const resolved = resolveProviderConfig(config)
    if ('issues' in resolved)
      throw new TypeError(`invalid session provider configuration: ${resolved.issues[0]?.message}`)
    this.runtime = startProvider(ctx, resolved.value, measure)
  }

  get work(): SessionFaces<unknown>['work'] {
    return this.runtime.facesFor(callerOf(this)).work
  }
  get management(): SessionFaces<unknown>['management'] {
    return this.runtime.facesFor(callerOf(this)).management
  }
  get reconciliation(): SessionFaces<unknown>['reconciliation'] {
    return this.runtime.facesFor(callerOf(this)).reconciliation
  }
  get history(): SessionFaces<unknown>['history'] {
    return this.runtime.facesFor(callerOf(this)).history
  }
}

/** What the assembly entry hands to `createSessionProviderPlugin`. */
export type SessionProviderPluginInput = Readonly<{
  /**
   * The observer of the Session measurement events, handed to the session instance of every load
   * of the plugin (Session SPEC「测量事件」). It is a function, so it is not a configuration
   * member. Absent: no event is built, as with `SessionProvider` itself.
   */
  measure?: SessionMeasure
}>

/**
 * The plugin of `SessionProvider` with the measurement observer that the assembly entry hands in.
 * The `inject`, the configuration and the provided key are those of `SessionProvider`; the
 * observer is not a Cordis service and not a configuration member. Use the returned class as
 * `ctx.plugin(Plugin, config)` does with `SessionProvider`.
 */
export function createSessionProviderPlugin(
  input: SessionProviderPluginInput = {},
): typeof SessionProvider {
  const { measure } = input
  return class SessionProviderMeasuredPlugin extends SessionProvider {
    constructor(ctx: Context, config: SessionProviderConfig = {}) {
      super(ctx, config, measure)
    }
  }
}
