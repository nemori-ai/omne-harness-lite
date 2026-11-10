// The `model-credential` row (application assembly, model-host-local credential port): the Model
// credential port over the secret custody of the `secret-custody` row. A model provider's
// credentials are secret setting items of its asset, so the port reads the very bindings the
// `settings` row writes for a tenant and `setup` writes for the deployment: the provider sources
// and their binding keys come from the release providers (`src/assets/model-providers.ts`). The
// row writes nothing and has no configuration; it injects the custody, so it unloads with it.
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { modelCredentialKey } from '@omne-harness/model-cordis-contract/cordis'
import { createSecretCredentialPort } from '@omne-harness/model-host-local'
import { serveModelCredential } from '@omne-harness/model-host-local/cordis'
import { credentialProviders } from '../../assets/model-providers.ts'
import { defineRow } from '../../row.ts'
import { settingsSecretCustodyKey } from '../secret-custody/index.ts'

const plugin: Plugin.Object = {
  name: 'model-credential',
  inject: [settingsSecretCustodyKey],
  apply(ctx: Context) {
    const custody = ctx.settingsSecretCustody
    const port = createSecretCredentialPort({
      custody: { describe: key => custody.describe(key), use: key => custody.use(key) },
      providers: credentialProviders(),
    })
    serveModelCredential(ctx, port)
  },
}

export const modelCredentialRow = defineRow({
  row: 'model-credential',
  implementation: 'real',
  manifest: {
    provides: [modelCredentialKey],
    injects: [settingsSecretCustodyKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin,
})
