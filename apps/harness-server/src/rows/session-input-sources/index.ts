import {
  sessionInputSourcesKey,
  sessionInputSourcesPlugin,
} from '@omne-harness/session-cordis-contract/cordis'
import { defineRow } from '../../row.ts'

export const sessionInputSourcesRow = defineRow({
  row: 'session-input-sources',
  implementation: 'real',
  manifest: {
    provides: [sessionInputSourcesKey],
    injects: [],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: sessionInputSourcesPlugin,
})
