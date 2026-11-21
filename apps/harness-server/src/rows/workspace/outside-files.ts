import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  outsideFilesOf,
  workspaceOutsideFilesSettings,
  type OutsideFiles,
} from '@omne-harness/workspace-local'
import type { TenantIndependentSettingsService } from '../governance/independent-settings-service.ts'

/** Reads the tenant's setting for files outside the workspace at each ask. Null: it cannot be read now. */
export function outsideFilesReader(settings: () => TenantIndependentSettingsService | undefined) {
  return async (tenant: TenantId): Promise<OutsideFiles | null> => {
    const service = settings()
    const text = tenantCodec.encode(tenant)
    if (service === undefined || !text.ok) return null
    try {
      const { request } = service.bindingOf(text.value, workspaceOutsideFilesSettings)
      return outsideFilesOf(await service.read(text.value, request))
    } catch {
      return null
    }
  }
}
