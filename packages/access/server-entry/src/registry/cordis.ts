// The Cordis provider of the access registry. A domain reaches it as `ctx.accessRegistry` and sees
// only `mount`; the assembly hands the registry inside (`provider.registry`) to the entry, whose
// pipeline enters and subscribes and which mounts `access/v1` itself. A listener that throws leaves
// one `access.listener-fault` diagnostic (#1249 spec 已定 11).
import type { Context } from '@deepseek-ai/cordis'
import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import { AccessRegistryService } from '@omne-harness/access-cordis-contract/cordis'
import type { ProtocolContract } from '@omne-harness/public-contract'
import type { PipelineDiagnostic } from '../pipeline/pipeline.ts'
import { createAccessRegistry, type AccessRegistry, type RegistryForPipeline } from './registry.ts'

export type AccessRegistryProviderOptions = {
  /** The assembly's `access.diagnostics`. A sink that throws changes nothing in the registry. */
  readonly diagnostics?: (event: PipelineDiagnostic) => void
}

/** @owner packages/access/server-entry */
export class AccessRegistryProvider extends AccessRegistryService implements RegistryForPipeline {
  /** The registry itself, for the entry's `access.registry`. */
  readonly registry: AccessRegistry
  constructor(ctx: Context, options: AccessRegistryProviderOptions = {}) {
    super(ctx)
    const { diagnostics } = options
    this.registry = createAccessRegistry({
      onListenerError: () => {
        try {
          diagnostics?.({ code: 'access.listener-fault' })
        } catch {
          // The sink's own failure is not the registry's.
        }
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
