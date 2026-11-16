import { Service, type Context, type Plugin } from '@deepseek-ai/cordis'
import type { ProtocolContract } from '@omne-harness/public-contract'
import type { AccessContribution } from './contribution.ts'

/** @owner packages/access/access-cordis-contract */
export abstract class AccessRegistryService extends Service {
  static readonly provide = 'accessRegistry'
  constructor(ctx: Context) {
    super(ctx, AccessRegistryService.provide)
  }

  mount<P extends ProtocolContract>(contribution: AccessContribution<P>): void {
    this.ctx.effect(
      () => this.attach(contribution as unknown as AccessContribution<ProtocolContract>),
      'accessRegistry.mount',
    )
  }

  protected abstract attach(contribution: AccessContribution<ProtocolContract>): () => Promise<void>
}
export const accessRegistryKey = AccessRegistryService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    accessRegistry: AccessRegistryService
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
