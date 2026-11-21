import { mediaIntakePlugin } from '@omne-harness/media-adapters/cordis'
import { mediaKey } from '@omne-harness/media-cordis-contract/cordis'
import { sessionBeforeIntakeKey } from '@omne-harness/session-cordis-contract/cordis'
import { defineRow } from '../../row.ts'

/** Media's processor before Session's intake. Without this row an input that refers to media is not accepted. */
export const mediaIntakeRow = defineRow({
  row: 'media-intake',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [mediaKey, sessionBeforeIntakeKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: mediaIntakePlugin,
})
