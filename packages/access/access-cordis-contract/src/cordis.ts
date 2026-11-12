// The Cordis service definition of the access registry. A domain's access plugin sees only `mount`;
// the provider lives in `@omne-harness/server-entry/cordis` and adds the pipeline's methods.
import { Service, type Context } from '@deepseek-ai/cordis'
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
