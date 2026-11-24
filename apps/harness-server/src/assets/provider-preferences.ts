import type { Context } from '@deepseek-ai/cordis'
import type { TenantId } from '@omne-harness/legal-identity'
import {
  MODEL_PROVIDER_CATEGORY,
  MODEL_REASONING_EFFORTS,
  MODEL_SWITCHES,
  preferencesOf,
} from '@omne-harness/model-contract/provider-asset'
import type { ModelPreferencesPort } from '@omne-harness/model-contract/provider'
import {
  tenantAssetSettingsKey,
  type TenantAssetSettingsService,
} from '../rows/governance/tenant-settings-service.ts'
import { releaseProvider } from './model-providers.ts'

const UNAVAILABLE = Object.freeze({ failure: Object.freeze({ kind: 'unavailable' as const }) })
const KEPT_MAX = 512

/** Each provider's ordinary setting values of one tenant, by provider name and item. */
type Values = ReadonlyMap<string, ReadonlyMap<string, unknown>>
type Views = Exclude<Awaited<ReturnType<TenantAssetSettingsService['items']>>, 'unknown'>

function valuesOf(views: Views): Values {
  const values = new Map<string, Map<string, unknown>>()
  for (const view of views) {
    if (view.owner.kind !== 'asset' || view.kind !== 'ordinary') continue
    const items = values.get(view.owner.name) ?? new Map<string, unknown>()
    values.set(view.owner.name, items)
    const { value } = view.effective
    items.set(view.item, value.kind === 'set' ? value.value : undefined)
  }
  return values
}

// A tenant's two settings on a release provider over its catalog; settings not held yet are not readable,
// never all on or all off. One read per tenant is kept until that tenant's settings are written again.
export function createProviderPreferences(ctx: Context): ModelPreferencesPort {
  const kept = new Map<TenantId, Readonly<{ stamp: number; values: Values }>>()

  async function tenantValues(tenant: TenantId): Promise<Values | undefined> {
    const settings = ctx.get(tenantAssetSettingsKey, false)
    if (settings === undefined) return undefined
    const stamp = settings.writes(tenant)
    const have = kept.get(tenant)
    if (have?.stamp === stamp) return have.values
    const views = await settings.items({ tenant, category: MODEL_PROVIDER_CATEGORY })
    if (views === 'unknown') return undefined
    const values = valuesOf(views)
    kept.delete(tenant)
    kept.set(tenant, { stamp, values })
    if (kept.size > KEPT_MAX) kept.delete(kept.keys().next().value as TenantId)
    return values
  }

  return {
    async read({ provider, access }) {
      const release = releaseProvider(provider)
      if (release === undefined) return UNAVAILABLE
      const items = (await tenantValues(access.tenant))?.get(provider)
      if (items === undefined || !items.has(MODEL_SWITCHES)) return UNAVAILABLE
      return {
        ok: preferencesOf(
          release.body,
          items.get(MODEL_SWITCHES),
          items.get(MODEL_REASONING_EFFORTS),
        ),
      }
    },
  }
}
