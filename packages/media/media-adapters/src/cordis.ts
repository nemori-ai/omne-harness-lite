import type { Context } from '@deepseek-ai/cordis'
import { mediaKey } from '@omne-harness/media-cordis-contract/cordis'
import { sessionBeforeIntakeKey } from '@omne-harness/session-cordis-contract/cordis'
import { createReferencesProcessor } from './index.ts'

/** Registers `media.references` while media and Session's registration point are both there. */
export const mediaIntakePlugin = {
  name: 'media-intake',
  inject: [mediaKey, sessionBeforeIntakeKey],
  apply(ctx: Context) {
    ctx.sessionBeforeIntake.register(createReferencesProcessor(() => ctx.get(mediaKey)?.custody))
  },
}
