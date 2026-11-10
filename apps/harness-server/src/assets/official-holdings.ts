// The official holdings of this application: the assets the release holds for every legal tenant
// (assets-and-rules F7) and the Settings holding each of them declares. A held asset is a fixed
// body of a registered category; its setting definition comes from the category's hook through
// `projectAssetSettings`. The holding is (asset reference, definition id): the definition is
// registered under the asset reference, so two different assets of one name never share a setting
// or a secret (I-9). This is the one place that composes a custody binding key from a holding; the
// target encoding is `@omne-harness/settings`'s `secretItemTarget`.
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

/** One asset the release holds: its category, name, pinned version and read body. */
export type OfficialAsset = Readonly<{
  category: string
  name: string
  version: string
  body: JsonValue
}>

/** What an official asset declares in Settings. */
export type OfficialHolding =
  | Readonly<{ kind: 'declared'; ref: SettingsHoldingRef; definition: SettingDefinitions }>
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'rejected'; reason: string }>

const SOURCE = 'official'
const categories = releaseCategories()

/** The asset reference of an official asset: unique and stable in the release. */
export function officialAssetRef(category: string, name: string): string {
  return `${SOURCE}/${category}/${name}`
}

/** The official asset of a release tool definition. */
export function toolAsset(definition: ToolDefinition): OfficialAsset {
  return {
    category: 'tool',
    name: definition.name,
    version: definition.adoption.digest,
    body: toolAssetBody(definition),
  }
}

/** The setting definition an official asset declares, registered under its asset reference. */
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

/** The binding key the custody keeps for one secret item of one holding in one scope. */
export function holdingKey(
  scope: SecretScope,
  holding: SettingsHolding,
  item: string,
): SecretBindingKey {
  return { scope, target: secretItemTarget(holding, item), purpose: SETTING_SECRET_PURPOSE }
}
