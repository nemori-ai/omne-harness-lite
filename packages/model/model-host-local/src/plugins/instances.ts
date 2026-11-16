import type { Context } from '@deepseek-ai/cordis'
import {
  ModelInstancesService,
  modelPublicationAuthorityKey,
} from '@omne-harness/model-cordis-contract/cordis'

export class ModelInstancesLocalPlugin extends ModelInstancesService<unknown> {
  static readonly inject = [modelPublicationAuthorityKey]

  constructor(ctx: Context) {
    super(ctx, ctx.modelPublicationAuthority)
  }
}
