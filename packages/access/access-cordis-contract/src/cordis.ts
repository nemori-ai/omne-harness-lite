// The Cordis service definition of the access registry. A domain's access plugin sees only `mount`;
// the provider lives in `@omne-harness/server-entry/cordis` and adds the pipeline's methods.
import { Service, type Context, type Plugin } from '@deepseek-ai/cordis'
import type { ProtocolContract } from '@omne-harness/public-contract'
import type { AccessContribution } from './contribution.ts'

/** @owner packages/access/access-cordis-contract */
export abstract class AccessRegistryService extends Service {
  static readonly provide = 'accessRegistry'
  constructor(ctx: Context) {
    super(ctx, AccessRegistryService.provide)
  }

  /**
   * Mounts `contribution` as an effect of the caller's scope. A protocol of the same name and major
   * version already mounted throws `AccessAssemblyError` and fails the caller; the mounted one stays.
   * When the scope unloads, the protocol comes off the registry at once, and the unload waits until
   * every call and observation of this contribution has ended.
   */
  mount<P extends ProtocolContract>(contribution: AccessContribution<P>): void {
    this.ctx.effect(
      () => this.attach(contribution as unknown as AccessContribution<ProtocolContract>),
      'accessRegistry.mount',
    )
  }

  /**
   * Puts the contribution on the registry synchronously, or throws `AccessAssemblyError`. Returns
   * the take-down: it removes the protocol synchronously and settles when the last in-flight work
   * of this contribution has left.
   */
  protected abstract attach(contribution: AccessContribution<ProtocolContract>): () => Promise<void>
}
export const accessRegistryKey = AccessRegistryService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    accessRegistry: AccessRegistryService
  }
}

/** The name of a service on the Cordis context; its type is the one the context declares. */
export type ServiceKey = string & keyof Context

/** Takes a service at the moment of the call; `undefined` while its provider is not there. */
export type Provide = <K extends ServiceKey>(key: K) => Context[K] | undefined

/** What a domain writes for one access plugin (RFC-0015 §5「登记表与贡献」). */
export type AccessPluginDefinition<P extends ProtocolContract> = Readonly<{
  name: string
  protocol: P
  /**
   * Builds the handlers and frame sources once, when the plugin loads. Each of them takes the
   * domain services it needs through `provide` at every call. A service that is not there is
   * `undefined`: the handler answers `basis-unavailable`, and the protocol stays mounted.
   */
  handlers: (provide: Provide) => Omit<AccessContribution<P>, 'protocol'>
}>

/**
 * An access plugin: it depends on the access registry only, mounts the contribution on its own
 * scope, and takes the domain services at each call. A domain provider that comes and goes does
 * not take the protocol down (RFC-0015 I-5); unloading the plugin does.
 */
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
