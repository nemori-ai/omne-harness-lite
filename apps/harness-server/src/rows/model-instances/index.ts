// The `model-instances` row: model-host-local `ModelInstancesLocalPlugin`, the one instance
// directory. It injects `modelPublicationAuthority`, which an entry object of the assembly provides
// (application assembly, runtime objects). Without it the row stays PENDING and names the key. It
// has no shutdown phase and no configuration.
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
