import { capabilityId, pinBody, projectAssetSettings, type JsonValue } from '@omne-harness/assets'
import {
  SETTING_SECRET_PURPOSE,
  secretItemTarget,
  type SecretBindingKey,
  type SecretScope,
  type SettingDefinitions,
  type SettingsHolding,
  type SettingsHoldingRef,
} from '@omne-harness/settings'
import { toolAssetBody, type ToolDefinition } from '@omne-harness/tool-contract'
import { releaseCategories } from './categories.ts'

export type OfficialAsset = Readonly<{
  category: string
  name: string
  version: string
  body: JsonValue
}>

export type OfficialHolding =
  | Readonly<{ kind: 'declared'; ref: SettingsHoldingRef; definition: SettingDefinitions }>
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'rejected'; reason: string }>

const SOURCE = 'official'
const categories = releaseCategories()

export function officialAssetRef(category: string, name: string): string {
  return `${SOURCE}/${category}/${name}`
}

export function toolAsset(definition: ToolDefinition): OfficialAsset {
  return {
    category: 'tool',
    name: definition.name,
    version: definition.adoption.digest,
    body: toolAssetBody(definition),
  }
}

export function officialHolding(asset: OfficialAsset): OfficialHolding {
  const identity = capabilityId(asset.category, asset.name)
  if (!identity.ok) return { kind: 'rejected', reason: identity.rejected }
  const assetRef = officialAssetRef(asset.category, asset.name)
  const pinned = pinBody({
    identity: identity.id,
    version: asset.version,
    source: SOURCE,
    body: asset.body,
  })
  const projected = projectAssetSettings(categories, { assetRef, pinned })
  if (projected.kind !== 'declared') return projected
  const definition = { ...projected.definition, providerId: assetRef }
  return {
    kind: 'declared',
    ref: {
      asset: { category: asset.category, name: asset.name },
      holding: { providerId: assetRef, definitionId: definition.definitionId },
    },
    definition,
  }
}

export function holdingKey(
  scope: SecretScope,
  holding: SettingsHolding,
  item: string,
): SecretBindingKey {
  return { scope, target: secretItemTarget(holding, item), purpose: SETTING_SECRET_PURPOSE }
}
