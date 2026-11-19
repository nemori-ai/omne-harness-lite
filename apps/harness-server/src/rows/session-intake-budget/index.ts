import type { Context } from '@deepseek-ai/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { runtimeContextTenantBlocksKey } from '@omne-harness/runtime-context-cordis-contract/cordis'
import {
  pendingLimitOf,
  sessionIntakeBudgetBlock,
  sessionIntakeSettings,
  sessionIntakeSettingsPlugin,
} from '@omne-harness/session-adapters/cordis'
import { defineRow } from '../../row.ts'
import {
  tenantIndependentSettingsKey,
  type TenantIndependentSettingsService,
} from '../governance/independent-settings-service.ts'

/** Reads the pending limit a tenant set, as the tenant's own preference target. */
export function pendingLimitReader(settings: () => TenantIndependentSettingsService | undefined) {
  return async (tenant: TenantId): Promise<number | null> => {
    const service = settings()
    const text = tenantCodec.encode(tenant)
    if (service === undefined || !text.ok) return null
    const { request } = service.bindingOf(text.value, sessionIntakeSettings)
    return pendingLimitOf(await service.read(text.value, request))
  }
}

/** The owner of the block `session.intake-budget`: the tenant's setting, read at each ask. */
export const sessionIntakeBudgetRow = defineRow({
  row: 'session-intake-budget',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [runtimeContextTenantBlocksKey, tenantIndependentSettingsKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'composition' },
  async body(ctx: Context) {
    ctx.plugin(sessionIntakeSettingsPlugin)
    const read = pendingLimitReader(() => ctx.get(tenantIndependentSettingsKey))
    ctx.inject([runtimeContextTenantBlocksKey], child => {
      child[runtimeContextTenantBlocksKey].register({ blocks: [sessionIntakeBudgetBlock(read)] })
    })
    return { stop: async () => ({ kind: 'settled' as const }) }
  },
})
