import type { Context, Plugin } from '@deepseek-ai/cordis'
import { broughtDefinitionsPlugin } from '@omne-harness/assets-cordis-contract/cordis'
import {
  modelCredentialKey,
  modelPreferencesKey,
  modelProvidersPoint,
} from '@omne-harness/model-cordis-contract/cordis'
import { MODEL_PROVIDER_CATEGORY } from '@omne-harness/model-contract/provider-asset'
import { createSecretCredentialPort } from '@omne-harness/model-host-local'
import {
  modelProviderCategoryPlugin,
  serveModelCredential,
  serveModelPreferences,
} from '@omne-harness/model-host-local/cordis'
import { credentialProviders, releaseProviders } from '../../assets/model-providers.ts'
import { createProviderPreferences } from '../../assets/provider-preferences.ts'
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
    serveModelPreferences(ctx, createProviderPreferences(ctx))
    ctx.plugin(modelProviderCategoryPlugin)
    ctx.plugin(
      broughtDefinitionsPlugin(
        'model-providers-official',
        modelProvidersPoint.name,
        releaseProviders().map(({ body, document, version }) => ({
          name: body.name,
          item: officialItem(MODEL_PROVIDER_CATEGORY, body.name, version),
          body: document,
        })),
      ),
    )
  },
}

export const modelCredentialRow = defineRow({
  row: 'model-credential',
  implementation: 'real',
  manifest: {
    provides: [modelCredentialKey, modelPreferencesKey],
    injects: [settingsSecretCustodyKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin,
})
