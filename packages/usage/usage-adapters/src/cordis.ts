import type { Context } from '@deepseek-ai/cordis'
import type { ModelDispatchFacts } from '@omne-harness/model-contract'
import { modelDispatchFactsKey } from '@omne-harness/model-cordis-contract/cordis'
import type { SessionHistory } from '@omne-harness/session-contract'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import type { ToolAccounts } from '@omne-harness/tool-contract/provider'
import { toolAccountsKey } from '@omne-harness/tool-cordis-contract/cordis'
import {
  UsageSessionScopeService,
  usageSourcesKey,
} from '@omne-harness/usage-cordis-contract/cordis'
import {
  modelUsageSource,
  sessionUsageScope,
  toolUsageSource,
  type ScopeOwners,
  type SourceLimits,
} from './index.ts'

export type UsageAdaptersInput = Readonly<{
  owners: ScopeOwners
  limits: Readonly<{ model: SourceLimits; tool: SourceLimits }>
  pageBytes: number
}>

/** The Model and Tool sources registered while this plugin lives, and the session scope it provides. */
export function createUsageAdaptersPlugin(input: UsageAdaptersInput) {
  const history = (ctx: Context) =>
    ctx.intercept(sessionKey, { caller: 'reader' }).get(sessionKey)?.history as
      | SessionHistory<unknown>
      | undefined
  class SessionScope extends UsageSessionScopeService<unknown> {
    readonly resolve: UsageSessionScopeService<unknown>['resolve']

    constructor(ctx: Context) {
      super(ctx)
      const scope = sessionUsageScope(() => history(ctx), input)
      this.resolve = request => scope.resolve(request)
    }
  }
  return {
    name: 'usage-adapters',
    inject: [usageSourcesKey],
    apply(ctx: Context) {
      const sources = [
        modelUsageSource(
          () => ctx.get(modelDispatchFactsKey) as ModelDispatchFacts<unknown> | undefined,
          input.limits.model,
        ),
        toolUsageSource(
          () => ctx.get(toolAccountsKey) as ToolAccounts<unknown> | undefined,
          input.limits.tool,
        ),
      ]
      for (const source of sources)
        ctx.effect(() => {
          const registration = ctx.usageSources.register(source)
          if (registration.kind === 'conflict')
            throw new Error(`a usage source named ${registration.name} is already registered`)
          return () => registration.withdraw()
        }, `usage source ${source.name}`)
      ctx.plugin(SessionScope)
    },
  }
}
