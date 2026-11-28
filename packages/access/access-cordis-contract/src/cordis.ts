import { Service, type Context, type Plugin } from '@deepseek-ai/cordis'
import type { ProtocolContract } from '@omne-harness/public-contract'
import type { InProcessAnswer, InProcessCall } from './calls.ts'
import type { AccessContribution } from './contribution.ts'

/** @owner packages/access/access-cordis-contract */
export abstract class AccessRegistryService extends Service {
  static readonly provide = 'accessRegistry'
  constructor(ctx: Context) {
    super(ctx, AccessRegistryService.provide)
  }

  /** Puts the protocol as an effect of the calling plugin: served once it is ready, withdrawn when it leaves. */
  // Two plugins with one protocol are a conflict the entry answers, not an error thrown here.
  abstract mount<P extends ProtocolContract>(contribution: AccessContribution<P>): void
}
export const accessRegistryKey = AccessRegistryService.provide

/** @owner packages/access/access-cordis-contract */
export abstract class AccessCallsService extends Service {
  static readonly provide = 'accessCalls'
  constructor(ctx: Context) {
    super(ctx, AccessCallsService.provide)
  }

  abstract call(input: InProcessCall): Promise<InProcessAnswer>
}
export const accessCallsKey = AccessCallsService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    accessRegistry: AccessRegistryService
    accessCalls: AccessCallsService
  }
}

export type ServiceKey = string & keyof Context

export type Provide = <K extends ServiceKey>(key: K) => Context[K] | undefined

export type AccessPluginDefinition<P extends ProtocolContract> = Readonly<{
  name: string
  protocol: P
  handlers: (provide: Provide) => Omit<AccessContribution<P>, 'protocol'>
}>

export function defineAccessPlugin<P extends ProtocolContract>(
  definition: AccessPluginDefinition<P>,
): Plugin.Object {
  return {
    name: definition.name,
    inject: [AccessRegistryService.provide],
    apply(ctx: Context) {
      const provide: Provide = key => ctx.get(key)
      ctx.accessRegistry.mount({ protocol: definition.protocol, ...definition.handlers(provide) })
    },
  }
}
