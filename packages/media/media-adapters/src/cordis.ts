import type { Context } from '@deepseek-ai/cordis'
import { mediaKey } from '@omne-harness/media-cordis-contract/cordis'
import { sessionBeforeIntakeKey } from '@omne-harness/session-cordis-contract/cordis'
import { ModelMediaSourceService } from '@omne-harness/model-cordis-contract/cordis'
import { ToolMediaStoreService } from '@omne-harness/tool-cordis-contract/cordis'
import { categoryContributionPlugin } from '@omne-harness/assets-cordis-contract/cordis'
import {
  converterBodyContract,
  converterCategoryDisplay,
  createModelMediaSource,
  createReferencesProcessor,
  createToolMediaStore,
} from './index.ts'

/** Registers `media.references` while media and Session's registration point are both there. */
export const mediaIntakePlugin = {
  name: 'media-intake',
  inject: [mediaKey, sessionBeforeIntakeKey],
  apply(ctx: Context) {
    ctx.sessionBeforeIntake.register(createReferencesProcessor(() => ctx.get(mediaKey)?.custody))
  },
}

/** Provides `modelMediaSource` while media is there; media is taken again at every read. */
export class MediaModelSourcePlugin extends ModelMediaSourceService {
  static readonly inject = [mediaKey]
  readonly open: ModelMediaSourceService['open']

  constructor(ctx: Context) {
    super(ctx)
    this.open = createModelMediaSource(() => ctx.get(mediaKey)).open
  }
}

/** Provides `toolMediaStore` while media is there; the custody is taken again at every put. */
export class MediaToolStorePlugin extends ToolMediaStoreService<unknown> {
  static readonly inject = [mediaKey]
  readonly put: ToolMediaStoreService<unknown>['put']

  constructor(ctx: Context) {
    super(ctx)
    this.put = createToolMediaStore(() => ctx.get(mediaKey)?.custody).put
  }
}

/** Contributes the category `converter` to the assets while it is in the tree. */
export const converterCategoryPlugin = categoryContributionPlugin('converter-category', {
  contract: converterBodyContract(),
  display: converterCategoryDisplay,
})
