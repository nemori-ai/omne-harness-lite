import type { Context } from '@deepseek-ai/cordis'
import type { AssetsLocal } from '@omne-harness/assets-local'
import type { TenantSettingsAccess } from './tenant-runtime.ts'

export type TenantHoldings = Readonly<{ assets: AssetsLocal; settings: TenantSettingsAccess }>

/** The assets and the settings of a tenant, as the governance row holds them. Null while the governance row is away. */
export type TenantHoldingsHolder = {
  of: ((tenantRef: string) => Promise<TenantHoldings | undefined>) | null
}

const holders = new WeakMap<Context, TenantHoldingsHolder>()

export function tenantHoldingsHolder(ctx: Context): TenantHoldingsHolder {
  const root = ctx.root
  const found = holders.get(root)
  if (found !== undefined) return found
  const created: TenantHoldingsHolder = { of: null }
  holders.set(root, created)
  return created
}
