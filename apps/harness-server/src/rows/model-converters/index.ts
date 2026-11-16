import {
  modelConverterAuthorityKey,
  modelConvertersKey,
} from '@omne-harness/model-cordis-contract/cordis'
import { ModelConvertersLocalPlugin } from '@omne-harness/model-host-local/cordis'
import { defineRow } from '../../row.ts'

export const modelConvertersRow = defineRow({
  row: 'model-converters',
  implementation: 'real',
  manifest: {
    provides: [modelConvertersKey],
    injects: [modelConverterAuthorityKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: ModelConvertersLocalPlugin,
})
