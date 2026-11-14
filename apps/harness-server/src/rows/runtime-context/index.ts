import { createRuntimeContextPlugin } from '@omne-harness/runtime-context-cordis/cordis'
import {
  runtimeContextKey,
  runtimeContextTrustKey,
} from '@omne-harness/runtime-context-cordis-contract/cordis'
import { defineRow } from '../../row.ts'

export const runtimeContextRow = defineRow({
  row: 'runtime-context',
  implementation: 'real',
  manifest: {
    provides: [runtimeContextKey],
    injects: [runtimeContextTrustKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: createRuntimeContextPlugin(),
})
