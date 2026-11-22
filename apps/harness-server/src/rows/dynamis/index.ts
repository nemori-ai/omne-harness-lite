import { DynamisService, dynamisKey } from '@omne-harness/dynamis-cordis/cordis'
import { defineRow } from '../../row.ts'

/** The registry of this tree: every row that opens an extension point on it puts through this one. */
export const dynamisRow = defineRow({
  row: 'dynamis',
  implementation: 'real',
  manifest: {
    provides: [dynamisKey],
    injects: [],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: DynamisService,
})
