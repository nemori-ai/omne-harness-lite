import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { mediaStoresKey } from '@omne-harness/media-cordis-contract/cordis'
import { createLocalByteStore } from '@omne-harness/media-storage-local'
import { z } from 'zod'
import { defineRow } from '../../row.ts'

export const mediaStorageLocalConfig = z.strictObject({
  root: z.string().refine(isAbsolute, 'the root of the local media store is an absolute path'),
})

/** The byte store of media on this machine: registered by name, withdrawn when the row leaves. */
export const mediaStorageLocalRow = defineRow({
  row: 'media-storage-local',
  implementation: 'real',
  manifest: { provides: [], injects: [mediaStoresKey], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'media-storage-local',
    inject: [mediaStoresKey],
    Config: mediaStorageLocalConfig,
    apply(ctx: Context, raw: unknown) {
      const { root } = mediaStorageLocalConfig.parse(raw)
      ctx.mediaStores.register(createLocalByteStore({ root }))
    },
  },
})
