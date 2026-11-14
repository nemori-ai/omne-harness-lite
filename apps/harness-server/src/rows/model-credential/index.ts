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
