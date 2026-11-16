import {
  modelInstancesKey,
  modelPublicationAuthorityKey,
} from '@omne-harness/model-cordis-contract/cordis'
import { ModelInstancesLocalPlugin } from '@omne-harness/model-host-local/cordis'
import { defineRow } from '../../row.ts'

export const modelInstancesRow = defineRow({
  row: 'model-instances',
  implementation: 'real',
  manifest: {
    provides: [modelInstancesKey],
    injects: [modelPublicationAuthorityKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: ModelInstancesLocalPlugin,
})
