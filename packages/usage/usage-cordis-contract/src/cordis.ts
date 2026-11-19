import { Service, type Context as CordisContext } from '@deepseek-ai/cordis'
import type { Usage, UsageSessionScope } from '@omne-harness/usage-contract'
import type { UsageSources } from './index.ts'

/** @owner packages/usage/usage-cordis-contract */
export abstract class UsageService<P> extends Service implements Usage<P> {
  static readonly provide = 'usage'

  constructor(ctx: CordisContext) {
    super(ctx, UsageService.provide)
  }

  abstract readonly query: Usage<P>['query']
}
export const usageKey = UsageService.provide

/** @owner packages/usage/usage-cordis-contract */
export abstract class UsageSourcesService<P> extends Service implements UsageSources<P> {
  static readonly provide = 'usageSources'

  constructor(ctx: CordisContext) {
    super(ctx, UsageSourcesService.provide)
  }

  abstract readonly register: UsageSources<P>['register']
  abstract readonly current: UsageSources<P>['current']
}
export const usageSourcesKey = UsageSourcesService.provide

/** @owner packages/usage/usage-cordis-contract */
export abstract class UsageSessionScopeService<P> extends Service implements UsageSessionScope<P> {
  static readonly provide = 'usageSessionScope'

  constructor(ctx: CordisContext) {
    super(ctx, UsageSessionScopeService.provide)
  }

  abstract readonly resolve: UsageSessionScope<P>['resolve']
}
export const usageSessionScopeKey = UsageSessionScopeService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    usage: UsageService<unknown>
    usageSources: UsageSourcesService<unknown>
    usageSessionScope: UsageSessionScopeService<unknown>
  }
}
