import { Service, type Context, type Plugin } from '@deepseek-ai/cordis'
import type { Entry, Instance } from '@omne-harness/dynamis'
import type { ProtocolContract } from '@omne-harness/public-contract'
import type { AccessContribution } from './contribution.ts'

/** @owner packages/access/access-cordis-contract */
export abstract class AccessRegistryService extends Service {
  static readonly provide = 'accessRegistry'
  constructor(ctx: Context) {
    super(ctx, AccessRegistryService.provide)
  }

  /** Puts the protocol as an effect of the caller: it is served once that caller is ready. */
  mount<P extends ProtocolContract>(typed: AccessContribution<P>): void {
    const contribution = typed as unknown as AccessContribution<ProtocolContract>
    const dynamis = this.ctx.get('dynamis') as Placing
    dynamis.put(instance => [this.entry(contribution, instance)], {
      drain: instance => this.drained(contribution, instance),
    })
  }

  protected abstract entry(
    contribution: AccessContribution<ProtocolContract>,
    instance: Instance,
  ): Entry

  /** Resolves once nothing of this protocol runs on the instance that is being withdrawn. */
  protected abstract drained(
    contribution: AccessContribution<ProtocolContract>,
    instance: Instance,
  ): Promise<void>
}

/** The part of the `dynamis` service a mount goes through. */
type Placing = {
  put(
    made: (instance: Instance) => readonly Entry[],
    options: { drain: (instance: Instance) => Promise<void> },
  ): unknown
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
