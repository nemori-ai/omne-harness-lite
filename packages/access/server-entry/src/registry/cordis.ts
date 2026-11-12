// The Cordis provider of the access registry. A domain reaches it as `ctx.accessRegistry` and sees
// only `mount`; the pipeline holds the provider itself and uses `enter` and `subscribe`.
import type { Context } from '@deepseek-ai/cordis'
import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import { AccessRegistryService } from '@omne-harness/access-cordis-contract/cordis'
import type { ProtocolContract } from '@omne-harness/public-contract'
import {
  createAccessRegistry,
  type AccessRegistry,
  type AccessRegistryOptions,
  type RegistryForPipeline,
} from './registry.ts'

/** @owner packages/access/server-entry */
export class AccessRegistryProvider extends AccessRegistryService implements RegistryForPipeline {
  private readonly registry: AccessRegistry
  constructor(ctx: Context, options: AccessRegistryOptions = {}) {
    super(ctx)
    this.registry = createAccessRegistry(options)
  }

  protected attach(contribution: AccessContribution<ProtocolContract>): () => Promise<void> {
    return this.registry.mount(contribution)
  }

  readonly enter: RegistryForPipeline['enter'] = (key, name) => this.registry.enter(key, name)
  readonly subscribe: RegistryForPipeline['subscribe'] = listener =>
    this.registry.subscribe(listener)
}
