import { MediaToolStorePlugin } from '@omne-harness/media-adapters/cordis'
import { mediaKey } from '@omne-harness/media-cordis-contract/cordis'
import { toolMediaStoreKey } from '@omne-harness/tool-cordis-contract/cordis'
import { defineRow } from '../../row.ts'

/** Media's store of what a tool call produced. Without this row a command that produces media is unavailable. */
export const mediaToolStoreRow = defineRow({
  row: 'media-tool-store',
  implementation: 'real',
  manifest: {
    provides: [toolMediaStoreKey],
    injects: [mediaKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: MediaToolStorePlugin,
})
