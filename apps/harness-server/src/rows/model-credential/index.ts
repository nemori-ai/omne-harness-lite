// The `model-credential` row (application assembly, model-host-local credential plugin): the
// file-backed credential custody of the single-machine host. It injects nothing and has no shutdown
// phase: the plugin closes its custodian on its own fiber. The configuration is the plugin's own
// (`path`, `factorySecret`, optional `lock` and `diagnosticsCapacity`) and the plugin validates it.
//
// The row loads the managed credential plugin (`createLocalCredentialPlugin`) as its child: the
// child provides `modelCredential` exactly as `LocalCredentialPlugin` does. The credentials are
// secret settings now, managed through the `settings` row; this row has no management face.
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { modelCredentialKey } from '@omne-harness/model-cordis-contract/cordis'
import {
  LocalCredentialPlugin,
  createLocalCredentialPlugin,
} from '@omne-harness/model-host-local/cordis'
import type { CreateOptions } from '@omne-harness/model-host-local'
import { defineRow } from '../../row.ts'

const plugin: Plugin.Object = {
  name: 'model-credential',
  Config: LocalCredentialPlugin.Config,
  async apply(ctx: Context, config: CreateOptions) {
    const managed = createLocalCredentialPlugin()
    await ctx.plugin(managed.plugin, config)
  },
}

export const modelCredentialRow = defineRow({
  row: 'model-credential',
  implementation: 'real',
  manifest: {
    provides: [modelCredentialKey],
    injects: [],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin,
})
