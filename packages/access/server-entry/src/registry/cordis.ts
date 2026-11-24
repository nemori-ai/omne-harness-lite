import type { Context } from '@deepseek-ai/cordis'
import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import { AccessRegistryService } from '@omne-harness/access-cordis-contract/cordis'
import { declare } from '@omne-harness/dynamis'
import type { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import type { ProtocolContract } from '@omne-harness/public-contract'
import type { PipelineDiagnostic } from '../pipeline/pipeline.ts'
import { createDesk, type ProtocolDesk } from './desk.ts'
import type { RegistryForPipeline } from './registry.ts'
import { entryOf, keyOf, protocolsContract } from './table.ts'

export type AccessRegistryProviderOptions = {
  readonly diagnostics?: (event: PipelineDiagnostic) => void
}

/** @owner packages/access/server-entry */
export class AccessRegistryProvider extends AccessRegistryService implements RegistryForPipeline {
  static readonly inject = ['dynamis']
  private readonly desk: ProtocolDesk
  private readonly dynamis: DynamisService

  constructor(ctx: Context, options: AccessRegistryProviderOptions = {}) {
    super(ctx)
    const { diagnostics } = options
    this.dynamis = ctx.get('dynamis') as DynamisService
    this.desk = createDesk(() => this.dynamis.registry(), {
      onListenerError: () => {
        try {
          diagnostics?.({ code: 'access.listener-fault' })
        } catch {}
      },
    })
    this.dynamis.put([declare(protocolsContract)])
    this.desk.changed(this.dynamis.registry())
    ctx.on('dynamis-cordis/changed', registry => this.desk.changed(registry))
  }

  /** Puts the protocol as an effect of the calling plugin: it is served once that plugin is ready. */
  override mount<P extends ProtocolContract>(typed: AccessContribution<P>): void {
    const contribution = typed as unknown as AccessContribution<ProtocolContract>
    const dynamis = this.ctx.get('dynamis') as DynamisService
    dynamis.put(instance => [entryOf(contribution, instance)], {
      drain: instance => this.desk.drained(instance, keyOf(contribution.protocol)),
    })
  }

  /** The entry's own protocol, put as the row that built this provider and taken back by hand. */
  own<P extends ProtocolContract>(typed: AccessContribution<P>): () => Promise<void> {
    const contribution = typed as unknown as AccessContribution<ProtocolContract>
    const controllers: AbortController[] = []
    const take = this.dynamis.put(instance => {
      const made = entryOf(contribution, instance)
      controllers.push(made.item.controller)
      return [made]
    })
    return async () => {
      for (const controller of controllers) controller.abort()
      await take()
    }
  }

  readonly enter: RegistryForPipeline['enter'] = (key, name, scope) =>
    this.desk.enter(key, name, scope)
  readonly subscribe: RegistryForPipeline['subscribe'] = listener => this.desk.subscribe(listener)
}
