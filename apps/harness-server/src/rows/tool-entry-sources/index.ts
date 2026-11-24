import { dynamisKey } from '@omne-harness/dynamis-cordis/cordis'
import {
  toolEntrySourcesKey,
  toolEntrySourcesPlugin,
} from '@omne-harness/tool-cordis-contract/cordis'
import { defineRow } from '../../row.ts'

export const toolEntrySourcesRow = defineRow({
  row: 'tool-entry-sources',
  implementation: 'real',
  manifest: {
    provides: [toolEntrySourcesKey],
    injects: [dynamisKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: toolEntrySourcesPlugin,
})
