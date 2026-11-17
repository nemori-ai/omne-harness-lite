import { readTenantText } from '@omne-harness/public-contract'
import { serviceKey } from '@omne-harness/shell-contract'
import type { ComponentType } from 'react'
import type { CategoryGovernance, CategorySnapshot, GovernanceModel } from './model/governance.ts'

export type CategoryView = CategoryGovernance & Readonly<{ Row: ComponentType<{ rowKey: string }> }>

export type AssetGovernance = Readonly<{
  open: (tenantText: string, category: string) => CategoryView
}>

export const assetGovernanceKey = serviceKey<AssetGovernance>('asset-governance')

const UNREADABLE_TENANT: CategorySnapshot = {
  kind: 'unreadable',
  notice: { kind: 'refused', text: '外壳给的租户读不懂，读不出这一类的资产。' },
}

const nothing = (): void => undefined

const unreadableTenant: CategoryGovernance = {
  subscribe: () => nothing,
  getSnapshot: () => UNREADABLE_TENANT,
  read: nothing,
  set: nothing,
  setSecret: nothing,
  clear: nothing,
  confirm: nothing,
  retryRow: nothing,
  close: nothing,
}

export function governancePort(
  governance: GovernanceModel,
  rowOf: (view: CategoryGovernance) => ComponentType<{ rowKey: string }>,
): AssetGovernance {
  return {
    open(tenantText, category) {
      const tenant = readTenantText(tenantText)
      const view = tenant === undefined ? unreadableTenant : governance.open(tenant, category)
      return { ...view, Row: rowOf(view) }
    },
  }
}
