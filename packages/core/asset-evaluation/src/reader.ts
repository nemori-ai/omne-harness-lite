import type { WorkspaceCarrierManifest, WorkspaceKey } from '@omne-harness-lite/asset-model'
import { getAssetJudge } from './defaults.ts'
import { readCarrier } from './workspace.ts'
import type { CarrierReadOutcome } from './types.ts'

export function readWorkspaceCarrier(
  manifest: WorkspaceCarrierManifest,
  workspace: WorkspaceKey,
): CarrierReadOutcome {
  return readCarrier(manifest, workspace, getAssetJudge())
}
