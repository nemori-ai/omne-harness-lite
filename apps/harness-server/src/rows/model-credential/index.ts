// The `model-credential` row (application assembly, model-host-local `LocalCredentialPlugin`): the
// file-backed credential custody of the single-machine host. It injects nothing and has no shutdown
// phase: the plugin closes its custodian on its own fiber. The configuration is the plugin's own
// (`path`, `factorySecret`, optional `lock` and `diagnosticsCapacity`) and the plugin validates it.
import { modelCredentialKey } from '@omne-harness/model-cordis-contract/cordis'
import { LocalCredentialPlugin } from '@omne-harness/model-host-local/cordis'
import { defineRow } from '../../row.ts'

export const modelCredentialRow = defineRow({
  row: 'model-credential',
  implementation: 'real',
  manifest: { provides: [modelCredentialKey], injects: [], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: LocalCredentialPlugin,
})
