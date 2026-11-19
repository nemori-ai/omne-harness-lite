import type { Context } from '@deepseek-ai/cordis'
import type { UsageSessionScope } from '@omne-harness/usage-contract'
import {
  UsageService,
  UsageSourcesService,
  usageSessionScopeKey,
  usageSourcesKey,
} from '@omne-harness/usage-cordis-contract/cordis'
import { createUsage, createUsageSources, type UsageLimits } from './index.ts'

/** The registry of usage sources in this tree. */
export class UsageSourcesProvider extends UsageSourcesService<unknown> {
  readonly register: UsageSourcesService<unknown>['register']
  readonly current: UsageSourcesService<unknown>['current']

  constructor(ctx: Context) {
    super(ctx)
    const sources = createUsageSources<unknown>()
    this.register = source => sources.register(source)
    this.current = () => sources.current()
  }
}

export type UsagePluginClass = {
  new (ctx: Context): UsageService<unknown>
  readonly inject: readonly string[]
}

/** The query service over the registered sources; the session scope is taken at each query. */
export function createUsagePlugin(input: Readonly<{ limits: UsageLimits }>): UsagePluginClass {
  const { limits } = input
  return class UsageProvider extends UsageService<unknown> {
    static readonly inject = [usageSourcesKey]
    readonly query: UsageService<unknown>['query']

    constructor(ctx: Context) {
      super(ctx)
      const usage = createUsage<unknown>({
        sources: () => ctx.usageSources.current(),
        sessionScope: () => ctx.get(usageSessionScopeKey) as UsageSessionScope<unknown> | undefined,
        limits,
      })
      this.query = request => usage.query(request)
    }
  }
}
