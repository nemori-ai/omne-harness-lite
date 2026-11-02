// The `model-converters` row: model-host-local `ModelConvertersLocalPlugin`, the one converter
// catalog. It injects `modelConverterAuthority`, which an entry object of the assembly provides. The
// catalog has no consumer in M2 and no other row injects its key. It has no shutdown phase and no
// configuration.
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
