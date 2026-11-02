// MD-02: the plugin that builds and publishes the one `ModelInstancesService`. The directory
// itself, its tenant-and-call routing and its caller-fiber registrations belong to
// model-cordis-contract; this plugin only wires the publication authority into it.
import type { Context } from '@deepseek-ai/cordis'
import {
  ModelInstancesService,
  modelPublicationAuthorityKey,
} from '@omne-harness/model-cordis-contract/cordis'

/**
 * Without `modelPublicationAuthority` the fiber waits and publishes nothing. When the authority is
 * replaced or removed, Cordis unloads this fiber with it: the directory and its routes end, and the
 * successor starts empty, so a handle registered with the old directory is not served by the new
 * one. Losing the directory affects the taking of routes only; calls and results are served
 * elsewhere.
 */
export class ModelInstancesLocalPlugin extends ModelInstancesService<unknown> {
  static readonly inject = [modelPublicationAuthorityKey]

  constructor(ctx: Context) {
    super(ctx, ctx.modelPublicationAuthority)
  }
}
