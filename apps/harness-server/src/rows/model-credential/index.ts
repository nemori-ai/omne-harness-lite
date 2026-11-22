import type { Context, Plugin } from '@deepseek-ai/cordis'
import { broughtDefinitionsPlugin } from '@omne-harness/assets-cordis-contract/cordis'
import { modelCredentialKey, modelProvidersPoint } from '@omne-harness/model-cordis-contract/cordis'
import { MODEL_PROVIDER_CATEGORY } from '@omne-harness/model-contract/provider-asset'
import { createSecretCredentialPort } from '@omne-harness/model-host-local'
import {
  modelProviderCategoryPlugin,
  serveModelCredential,
} from '@omne-harness/model-host-local/cordis'
import { credentialProviders, releaseProviders } from '../../assets/model-providers.ts'
import { officialItem } from '../../assets/official-holdings.ts'
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
    ctx.plugin(modelProviderCategoryPlugin)
    ctx.plugin(
      broughtDefinitionsPlugin(
        'model-providers-official',
        modelProvidersPoint.name,
        releaseProviders().map(({ body, version }) => ({
          name: body.name,
          item: officialItem(MODEL_PROVIDER_CATEGORY, body.name, version),
        })),
      ),
    )
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
