import type { WorkspaceCarrierManifest, WorkspaceKey } from '@omne-harness-lite/asset-model'
import { assetJudge } from './defaults.ts'
import { readCarrier } from './workspace.ts'
import type { CarrierReadOutcome } from './types.ts'

export function readWorkspaceCarrier(
  manifest: WorkspaceCarrierManifest,
  workspace: WorkspaceKey,
): CarrierReadOutcome {
  return readCarrier(manifest, workspace, assetJudge)
}
