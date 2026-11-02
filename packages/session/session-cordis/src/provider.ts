// The concrete subclass of `SessionService`, which is also the plugin (SPEC properties 1 and 2).
// The abstract class registers the key `session`; this class writes no key and does not call
// `ctx.provide`. State lives in `runtime` and not in `#private` fields, because a caller reads
// the service through an extended copy of it and `#private` fields fail through that copy.
import { Service, type Context } from '@deepseek-ai/cordis'
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

  constructor(ctx: Context, config: SessionProviderConfig = {}) {
    super(ctx)
    const resolved = resolveProviderConfig(config)
    if ('issues' in resolved)
      throw new TypeError(`invalid session provider configuration: ${resolved.issues[0]?.message}`)
    this.runtime = startProvider(ctx, resolved.value)
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
