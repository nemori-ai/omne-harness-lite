import type { Context } from '@deepseek-ai/cordis'
import {
  mediaImageKey,
  mediaIndexKey,
  mediaKey,
  mediaStoresKey,
} from '@omne-harness/media-cordis-contract/cordis'
import { MediaStoresProvider, createMediaPlugin } from '@omne-harness/media/cordis'
import { z } from 'zod'
import { defineRow } from '../../row.ts'

const positive = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
const MIB = 1024 * 1024
const HOUR_MS = 60 * 60 * 1000

/** A part is sent as base64 inside a message of the `input` limit: 256 KiB of bytes fit with room. */
export const mediaConfig = z.strictObject({
  writeTo: z.string().min(1).default('local'),
  maxBytes: z
    .strictObject({
      image: positive.default(20 * MIB),
      voice: positive.default(25 * MIB),
      file: positive.default(32 * MIB),
    })
    .prefault({}),
  partBytes: positive.max(512 * 1024).default(256 * 1024),
  uploadTtlMs: positive.default(24 * HOUR_MS),
  stagingTtlMs: positive.default(24 * HOUR_MS),
  variantCacheBytes: positive.default(64 * MIB),
})

/** The custody of media and the registry its byte stores come to. */
export const mediaRow = defineRow({
  row: 'media',
  implementation: 'real',
  manifest: {
    provides: [mediaStoresKey, mediaKey],
    injects: [mediaIndexKey, mediaImageKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'media',
    inject: [mediaIndexKey, mediaImageKey],
    Config: mediaConfig,
    apply(ctx: Context, raw: unknown) {
      const { writeTo, ...config } = mediaConfig.parse(raw)
      ctx.plugin(MediaStoresProvider)
      ctx.plugin(createMediaPlugin({ config, writeTo }))
    },
  },
})
