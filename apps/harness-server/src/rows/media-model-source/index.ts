import { MediaModelSourcePlugin } from '@omne-harness/media-adapters/cordis'
import { mediaKey } from '@omne-harness/media-cordis-contract/cordis'
import { modelMediaSourceKey } from '@omne-harness/model-cordis-contract/cordis'
import { defineRow } from '../../row.ts'

/** Media's source of bytes for a model send. Without this row a request that refers to media is not sent. */
export const mediaModelSourceRow = defineRow({
  row: 'media-model-source',
  implementation: 'real',
  manifest: {
    provides: [modelMediaSourceKey],
    injects: [mediaKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: MediaModelSourcePlugin,
})
