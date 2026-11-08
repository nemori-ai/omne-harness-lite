import type { Reply, ToolCallId } from '@omne-harness/tool-contract'
import type { ToolMaterialInstant } from '@omne-harness/tool-contract/provider'
import type { TenantId } from './ledger-store.ts'

export type MaterialMaintenancePage = Readonly<{
  calls: readonly ToolCallId[]
  next: string | null
}>

export type ToolMaterialMaintenanceSource = Readonly<{
  scan(
    input: Readonly<{
      tenant: TenantId
      at: ToolMaterialInstant
      after: string | null
      limit: number
    }>,
  ): Reply<MaterialMaintenancePage>
}>
