import type { Context } from '@deepseek-ai/cordis'
import { mediaKey } from '@omne-harness/media-cordis-contract/cordis'
import { sessionBeforeIntakeKey } from '@omne-harness/session-cordis-contract/cordis'
import { ModelMediaSourceService } from '@omne-harness/model-cordis-contract/cordis'
import { createModelMediaSource, createReferencesProcessor } from './index.ts'

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
