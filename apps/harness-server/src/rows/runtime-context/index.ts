// The `runtime-context` row: the Runtime Context provider. The plugin is the class that
// `createRuntimeContextPlugin()` of `@omne-harness/runtime-context-cordis/cordis` returns (the
// provider with runtime-context's own mechanism factory; the `mechanism` option is for tests and is
// not used). It injects `runtimeContextTrust` (trusted, visible to this row only) and provides
// `runtimeContext`. It has no shutdown phase: the mechanism closes with the row fiber.
//
// Configuration (data only, all optional, initial values come from the plugin): `retention`,
// `replayCapacity`, `supplyBoundMs`, `settleBoundMs`, `readCacheEntries`, `diagnostics`. The plugin
// also takes `refreshConcurrency` and `refreshRetryMs`, which the assembly page does not list; the
// row does not narrow its `Config`. Unknown fields and values outside a bound fail the load.
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
