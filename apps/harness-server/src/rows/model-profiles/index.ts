import { modelPreferencesKey, modelProfilesKey } from '@omne-harness/model-cordis-contract/cordis'
import { ModelProfilesLocalPlugin } from '@omne-harness/model-host-local/cordis'
import { defineRow } from '../../row.ts'

export const modelProfilesRow = defineRow({
  row: 'model-profiles',
  implementation: 'real',
  manifest: {
    provides: [modelProfilesKey],
    injects: [modelPreferencesKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: ModelProfilesLocalPlugin,
})
