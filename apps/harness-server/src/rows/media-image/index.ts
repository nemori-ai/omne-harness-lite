import type { Context } from '@deepseek-ai/cordis'
import { MediaImageService, mediaImageKey } from '@omne-harness/media-cordis-contract/cordis'
import { createImageCodec } from '@omne-harness/media-image'
import { z } from 'zod'
import { defineRow } from '../../row.ts'

const positive = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)

/** How large a picture this deployment decodes, and how many at once. */
export const mediaImageConfig = z.strictObject({
  maxWidth: positive.default(16384),
  maxHeight: positive.default(16384),
  maxDecodedBytes: positive.default(128 * 1024 * 1024),
  concurrency: positive.max(64).default(2),
})

export const mediaImageRow = defineRow({
  row: 'media-image',
  implementation: 'real',
  manifest: { provides: [mediaImageKey], injects: [], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'media-image',
    Config: mediaImageConfig,
    apply(ctx: Context, raw: unknown) {
      const codec = createImageCodec(mediaImageConfig.parse(raw))
      ctx.plugin(
        class BoundedImage extends MediaImageService {
          readonly probe = codec.probe
          readonly fit = codec.fit
        },
      )
    },
  },
})
