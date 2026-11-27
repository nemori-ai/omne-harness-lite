import type { Context } from '@deepseek-ai/cordis'
import { decodeProviderName, type ProviderName } from '@omne-harness/model-contract'
import {
  CATALOG_KINDS,
  MODEL_PROVIDER_CATEGORY,
  MODEL_SWITCHES,
  type CatalogKind,
} from '@omne-harness/model-contract/provider-asset'
import { modelPreferencesKey } from '@omne-harness/model-cordis-contract/cordis'
import { officialCatalog } from '@omne-harness/model-host-local'
import { serveModelPreferences } from '@omne-harness/model-host-local/cordis'
import { defineRow } from '../../src/row.ts'
import {
  TenantAssetSettingsService,
  tenantAssetSettingsKey,
} from '../../src/rows/governance/tenant-settings-service.ts'

// Trees whose cases are about something other than a tenant's choice of models: every model is on.

const openrouter: ProviderName = (() => {
  const decoded = decodeProviderName('openrouter')
  if (!('ok' in decoded)) throw new Error('provider name')
  return decoded.ok
})()
const everyModel = () => officialCatalog(openrouter, () => true)
const modelsOf = (kind: CatalogKind) =>
  everyModel()
    .filter(entry => entry.kind === kind)
    .map(entry => entry.model)

/** Serves the preferences directly, for a tree without the model-credential row. */
export const everyModelOnRow = defineRow({
  row: 'every-model-on',
  implementation: 'real',
  manifest: { provides: [modelPreferencesKey], injects: [], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'every-model-on',
    apply(ctx: Context) {
      const enabled = { llm: new Set(modelsOf('llm')), decisions: new Set(modelsOf('decisions')) }
      serveModelPreferences(ctx, { read: async () => ({ ok: { enabled, efforts: new Map() } }) })
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
      const switches = Object.fromEntries(
        CATALOG_KINDS.map(kind => [
          kind,
          Object.fromEntries(modelsOf(kind).map(model => [model, true])),
        ]),
      )
      const view = {
        owner: { kind: 'asset', category: MODEL_PROVIDER_CATEGORY, name: 'openrouter' },
        item: MODEL_SWITCHES,
        kind: 'ordinary',
        effective: { value: { kind: 'set', value: switches } },
      }
      class EveryModelSwitchedOn extends TenantAssetSettingsService {
        readonly items = async () => [view] as never
        readonly writes = () => 0
        readonly declared = async () => 'unknown' as const
      }
      new EveryModelSwitchedOn(ctx)
    },
  },
})
