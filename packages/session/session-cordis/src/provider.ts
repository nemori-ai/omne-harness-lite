import { Service, type Context } from '@deepseek-ai/cordis'
import type { SessionInstanceOptions } from '@omne-harness/session'
import type { SessionDirectory, SessionFaces } from '@omne-harness/session-contract'
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

function callerOf(service: SessionService<unknown>) {
  try {
    return callerClassOf(service[Service.resolveConfig]())
  } catch {
    return null
  }
}

export class SessionProvider extends SessionService<unknown> {
  static readonly inject = [
    sessionAccessCheckKey,
    sessionDelegatedTransactionsKey,
    sessionPrincipalsKey,
    sessionWorkPrincipalsKey,
    assemblyLifecycleKey,
  ]
  static readonly Config = sessionProviderConfigSchema

  private readonly runtime: ProviderRuntime

  constructor(
    ctx: Context,
    config: SessionProviderConfig = {},
    observers: SessionProviderPluginInput = {},
  ) {
    super(ctx)
    const resolved = resolveProviderConfig(config)
    if ('issues' in resolved)
      throw new TypeError(`invalid session provider configuration: ${resolved.issues[0]?.message}`)
    this.runtime = startProvider(ctx, resolved.value, observers)
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
  override get directory(): SessionDirectory<unknown> {
    return this.runtime.facesFor(callerOf(this)).directory
  }
}

export type SessionProviderPluginInput = SessionInstanceOptions

export function createSessionProviderPlugin(
  input: SessionProviderPluginInput = {},
): typeof SessionProvider {
  return class SessionProviderMeasuredPlugin extends SessionProvider {
    constructor(ctx: Context, config: SessionProviderConfig = {}) {
      super(ctx, config, input)
    }
  }
}
