import type { Context } from '@deepseek-ai/cordis'
import {
  MODEL_PROVIDER_CATEGORY,
  MODEL_REASONING_EFFORTS,
  MODEL_SWITCHES,
  preferencesOf,
} from '@omne-harness/model-contract/provider-asset'
import type { ModelPreferencesPort } from '@omne-harness/model-contract/provider'
import { tenantAssetSettingsKey } from '../rows/governance/tenant-settings-service.ts'
import { releaseProvider } from './model-providers.ts'

const UNAVAILABLE = Object.freeze({ failure: Object.freeze({ kind: 'unavailable' as const }) })

// The two settings a tenant holds on a release provider, combined with its catalog. A provider whose
// settings the tenant does not hold yet is not readable: it is never taken as all on or all off.
export function createProviderPreferences(ctx: Context): ModelPreferencesPort {
  return {
    async read({ provider, access }) {
      const release = releaseProvider(provider)
      const settings = ctx.get(tenantAssetSettingsKey, false)
      if (release === undefined || settings === undefined) return UNAVAILABLE
      const views = await settings.items({
        tenant: access.tenant,
        category: MODEL_PROVIDER_CATEGORY,
      })
      if (views === 'unknown') return UNAVAILABLE
      const values = new Map<string, unknown>()
      for (const view of views)
        if (view.owner.kind === 'asset' && view.owner.name === provider && view.kind === 'ordinary')
          values.set(
            view.item,
            view.effective.value.kind === 'set' ? view.effective.value.value : undefined,
          )
      if (!values.has(MODEL_SWITCHES)) return UNAVAILABLE
      return {
        ok: preferencesOf(
          release.body,
          values.get(MODEL_SWITCHES),
          values.get(MODEL_REASONING_EFFORTS),
        ),
      }
    },
  }
}
