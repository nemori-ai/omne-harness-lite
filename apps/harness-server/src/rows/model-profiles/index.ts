// The `model-profiles` row: model-host-local `ModelProfilesLocalPlugin`, the official OpenAI
// profiles as one frozen snapshot. It injects nothing and has no shutdown phase. The configuration
// is the plugin's own (`retryPolicy`, `compactionTriggerPercent`, `updatedAt`), all required.
import { modelProfilesKey } from '@omne-harness/model-cordis-contract/cordis'
import { ModelProfilesLocalPlugin } from '@omne-harness/model-host-local/cordis'
import { defineRow } from '../../row.ts'

export const modelProfilesRow = defineRow({
  row: 'model-profiles',
  implementation: 'real',
  manifest: { provides: [modelProfilesKey], injects: [], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: ModelProfilesLocalPlugin,
})
