import type { TenantId } from '@omne-harness/public-contract'
import { serviceKey } from '@omne-harness/shell-contract'
import type { ComponentType } from 'react'
import type { CategoryGovernance } from './model/governance.ts'
import type { SettingRowProps } from './view/setting-row.tsx'

export type AssetGovernance = Readonly<{
  open: (tenant: TenantId, category: string) => CategoryGovernance
  SettingRow: ComponentType<SettingRowProps>
}>

export const assetGovernanceKey = serviceKey<AssetGovernance>('asset-governance')
