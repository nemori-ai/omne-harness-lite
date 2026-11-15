import type { Context } from '@deepseek-ai/cordis'
import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import { AccessRegistryService } from '@omne-harness/access-cordis-contract/cordis'
import type { ProtocolContract } from '@omne-harness/public-contract'
import type { PipelineDiagnostic } from '../pipeline/pipeline.ts'
import { createAccessRegistry, type AccessRegistry, type RegistryForPipeline } from './registry.ts'

export type AccessRegistryProviderOptions = {
  readonly diagnostics?: (event: PipelineDiagnostic) => void
}

/** @owner packages/access/server-entry */
export class AccessRegistryProvider extends AccessRegistryService implements RegistryForPipeline {
  readonly registry: AccessRegistry
  constructor(ctx: Context, options: AccessRegistryProviderOptions = {}) {
    super(ctx)
    const { diagnostics } = options
    this.registry = createAccessRegistry({
      onListenerError: () => {
        try {
          diagnostics?.({ code: 'access.listener-fault' })
        } catch {}
      },
    })
  }

  protected attach(contribution: AccessContribution<ProtocolContract>): () => Promise<void> {
    return this.registry.mount(contribution)
  }

  readonly enter: RegistryForPipeline['enter'] = (key, name) => this.registry.enter(key, name)
  readonly subscribe: RegistryForPipeline['subscribe'] = listener =>
    this.registry.subscribe(listener)
}
