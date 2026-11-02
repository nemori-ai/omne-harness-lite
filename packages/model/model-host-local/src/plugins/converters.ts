// The plugin that builds and publishes the one `ModelConvertersService`. The catalog and its
// leases belong to model-cordis-contract; this plugin wires the converter authority into it. It is
// independent of the runtime and of result queries.
import type { Context } from '@deepseek-ai/cordis'
import {
  ModelConvertersService,
  modelConverterAuthorityKey,
} from '@omne-harness/model-cordis-contract/cordis'

export class ModelConvertersLocalPlugin extends ModelConvertersService<unknown> {
  static readonly inject = [modelConverterAuthorityKey]

  constructor(ctx: Context) {
    super(ctx, ctx.modelConverterAuthority)
  }
}
