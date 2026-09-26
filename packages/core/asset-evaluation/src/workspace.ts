import {
  carrierRecordId,
  capabilityCanonicalString,
  type AssetModelJudge,
  type WorkspaceCarrierManifest,
  type WorkspaceKey,
} from '@omne-harness-lite/asset-model'
import { copyJson, immutable } from './json.ts'
import type {
  CarrierAssignment,
  CarrierHolding,
  CarrierReadOutcome,
  DroppedEntry,
} from './types.ts'

export function readCarrier(
  manifest: WorkspaceCarrierManifest,
  workspace: WorkspaceKey,
  judge: AssetModelJudge,
): CarrierReadOutcome {
  for (const [name, input] of [
    ['WorkspaceCarrierManifest', manifest],
    ['WorkspaceKey', workspace],
  ] as const) {
    const result = judge.judgeAssetValue(name, input)
    if ('rejected' in result)
      return immutable({
        invalidInput: {
          diagnostics: [{ condition: 'C1', message: name, rejected: result.rejected }],
        },
      })
  }
  const assignments = new Map<string, CarrierAssignment[]>()
  const dropped: DroppedEntry[] = []
  const known = new Set(manifest.assets.map(entry => capabilityCanonicalString(entry.capability)))
  for (const entry of manifest.assignments) {
    const key = capabilityCanonicalString(entry.capability)
    if (!known.has(key)) {
      dropped.push({
        capability: { ...entry.capability },
        item: entry.item,
        reason: 'unknown_asset',
      })
      continue
    }
    if (entry.immutable !== undefined)
      dropped.push({
        capability: { ...entry.capability },
        item: entry.item,
        reason: 'immutable_flag',
      })
    const existing = assignments.get(key) ?? []
    existing.push({ item: entry.item, value: copyJson(entry.value), immutable: false })
    assignments.set(key, existing)
  }
  const disabled = new Set<string>()
  for (const capability of manifest.disabled) {
    const key = capabilityCanonicalString(capability)
    if (known.has(key)) disabled.add(key)
    else dropped.push({ capability: { ...capability }, reason: 'unknown_asset' })
  }
  const holdings: CarrierHolding[] = manifest.assets.map(entry => {
    const key = capabilityCanonicalString(entry.capability)
    const values = [...(assignments.get(key) ?? [])]
    if (disabled.has(key)) values.push({ item: 'disabled', value: true, immutable: false })
    return {
      holder: {
        layer: 'workspace',
        workspace: { tenant: { ...workspace.tenant }, directory: workspace.directory },
      },
      capability: { ...entry.capability },
      asset: carrierRecordId(workspace, entry.capability),
      basis: { kind: 'carrier' },
      versionSelection: { kind: 'current' },
      immutable: false,
      assignments: values,
    }
  })
  return immutable({ ok: { holdings, dropped } })
}
