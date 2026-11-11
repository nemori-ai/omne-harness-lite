import { defineSettings, type SettingDefinitions } from '@omne-harness/settings'
import type { PinnedBody } from './adoption.ts'
import type { CategoryRegistry } from './identity.ts'
import { readSnapshot } from './read-body.ts'

export type AssetSettingsProjection =
  | Readonly<{
      kind: 'declared'
      assetRef: string
      version: string
      source: string
      definition: SettingDefinitions
    }>
  | Readonly<{ kind: 'none' }>
  | Readonly<{
      kind: 'rejected'
      reason: 'invalid_body' | 'unknown_category' | 'invalid_declaration' | 'provider_unavailable'
    }>

/** Derives declarations from the fixed body. This does not establish a holding or configuration right. */
export function projectAssetSettings(
  registry: CategoryRegistry,
  input: Readonly<{ assetRef: string; pinned: PinnedBody }>,
): AssetSettingsProjection {
  if (!input.assetRef || readSnapshot(input.pinned.body) === undefined)
    return { kind: 'rejected', reason: 'invalid_body' }
  const contract = registry.lookup(input.pinned.identity.category)
  if (!contract) return { kind: 'rejected', reason: 'unknown_category' }
  try {
    const context = { capabilityName: input.pinned.identity.name, definition: input.pinned.version }
    if (!contract.judge(input.pinned.body, context).ok)
      return { kind: 'rejected', reason: 'invalid_body' }
    const provided = contract.settings?.(input.pinned.body, context)
    if (provided === null || provided === undefined) return Object.freeze({ kind: 'none' })
    const checked = defineSettings(provided)
    if (checked.kind !== 'defined') return { kind: 'rejected', reason: 'invalid_declaration' }
    return Object.freeze({
      kind: 'declared',
      assetRef: input.assetRef,
      version: input.pinned.version,
      source: input.pinned.source,
      definition: checked.definition,
    })
  } catch {
    return { kind: 'rejected', reason: 'provider_unavailable' }
  }
}
