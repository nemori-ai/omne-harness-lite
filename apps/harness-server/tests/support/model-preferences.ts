import type { Context } from '@deepseek-ai/cordis'
import { decodeProviderName, type ProviderName } from '@omne-harness/model-contract'
import {
  CATALOG_KINDS,
  MODEL_PROVIDER_CATEGORY,
  MODEL_SWITCHES,
  type CatalogKind,
} from '@omne-harness/model-contract/provider-asset'
import { modelPreferencesKey } from '@omne-harness/model-cordis-contract/cordis'
import { officialCatalog, officialSupplierProviders } from '@omne-harness/model-host-local'
import { serveModelPreferences } from '@omne-harness/model-host-local/cordis'
import { defineRow } from '../../src/row.ts'
import {
  TenantAssetSettingsService,
  tenantAssetSettingsKey,
} from '../../src/rows/governance/tenant-settings-service.ts'

// Trees whose cases are about something other than a tenant's choice of models: every model of every
// provider the release brings is on.

const providerOf = (name: string): ProviderName => {
  const decoded = decodeProviderName(name)
  if (!('ok' in decoded)) throw new Error('provider name')
  return decoded.ok
}
const PROVIDERS = officialSupplierProviders()
const modelsOf = (provider: ProviderName, kind: CatalogKind) =>
  officialCatalog(provider, () => true)
    .filter(entry => entry.kind === kind)
    .map(entry => entry.model)
const allOn = (provider: ProviderName) => ({
  llm: new Set(modelsOf(provider, 'llm')),
  decisions: new Set(modelsOf(provider, 'decisions')),
})

/** Serves the preferences directly, for a tree without the model-credential row. */
export const everyModelOnRow = defineRow({
  row: 'every-model-on',
  implementation: 'real',
  manifest: { provides: [modelPreferencesKey], injects: [], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'every-model-on',
    apply(ctx: Context) {
      serveModelPreferences(ctx, {
        read: async ({ provider }) => ({
          ok: { enabled: allOn(providerOf(provider)), efforts: new Map() },
        }),
      })
    },
  },
})

/** The tenant's switches with every model on, for a tree with the model-credential row. */
export const everyModelSwitchedOnRow = defineRow({
  row: 'every-model-switched-on',
  implementation: 'real',
  manifest: { provides: [tenantAssetSettingsKey], injects: [], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'every-model-switched-on',
    apply(ctx: Context) {
      const views = PROVIDERS.map(provider => ({
        owner: { kind: 'asset', category: MODEL_PROVIDER_CATEGORY, name: provider },
        item: MODEL_SWITCHES,
        kind: 'ordinary',
        effective: {
          value: {
            kind: 'set',
            value: Object.fromEntries(
              CATALOG_KINDS.map(kind => [
                kind,
                Object.fromEntries(modelsOf(provider, kind).map(model => [model, true])),
              ]),
            ),
          },
        },
      }))
      class EveryModelSwitchedOn extends TenantAssetSettingsService {
        readonly items = async () => views as never
        readonly writes = () => 0
        readonly declared = async () => 'unknown' as const
      }
      new EveryModelSwitchedOn(ctx)
    },
  },
})
