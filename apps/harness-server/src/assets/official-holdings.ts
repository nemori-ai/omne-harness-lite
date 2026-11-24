import {
  capabilityId,
  pinBody,
  projectAssetSettings,
  readBodyText,
  type BodyContract,
  type HeldItem,
  type JsonValue,
} from '@omne-harness/assets'
import {
  SETTING_SECRET_PURPOSE,
  secretItemTarget,
  type SecretBindingKey,
  type SecretScope,
  type SettingDefinitions,
  type SettingsHolding,
  type SettingsHoldingRef,
} from '@omne-harness/settings'
import { toolAssetBody, toolBodyContract, type ToolDefinition } from '@omne-harness/tool-contract'

export type OfficialAsset = Readonly<{
  contract: BodyContract
  name: string
  version: string
  body: JsonValue
}>

export type OfficialHolding =
  | Readonly<{ kind: 'declared'; ref: SettingsHoldingRef; definition: SettingDefinitions }>
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'rejected'; reason: string }>

const SOURCE = 'official'
const TOOL_CONTRACT = toolBodyContract()

export function officialAssetRef(category: string, name: string): string {
  return `${SOURCE}/${category}/${name}`
}

/** An official definition as the item its category's point holds: enabled, and it locks nothing. */
export function officialItem(category: string, name: string, version: string): HeldItem {
  return {
    asset: officialAssetRef(category, name),
    version,
    disabled: false,
    immutable: false,
    replaceLocked: false,
  }
}

export function toolAsset(definition: ToolDefinition): OfficialAsset {
  return {
    contract: TOOL_CONTRACT,
    name: definition.name,
    version: definition.adoption.digest,
    body: toolAssetBody(definition),
  }
}

/** An official asset is judged by the contract it comes with; it asks no registry what its category is. */
export function officialHolding(asset: OfficialAsset): OfficialHolding {
  const { contract } = asset
  const { category } = contract
  const identity = capabilityId(category, asset.name)
  if (!identity.ok) return { kind: 'rejected', reason: identity.rejected }
  const assetRef = officialAssetRef(category, asset.name)
  const pinned = pinBody({
    identity: identity.id,
    version: asset.version,
    source: SOURCE,
    body: asset.body,
  })
  const own = { lookup: (asked: string) => (asked === category ? contract : undefined) }
  const projected = projectAssetSettings(own, { assetRef, pinned })
  if (projected.kind !== 'declared') return projected
  const definition = { ...projected.definition, providerId: assetRef }
  return {
    kind: 'declared',
    ref: {
      asset: { category, name: asset.name },
      holding: { providerId: assetRef, definitionId: definition.definitionId },
    },
    definition,
  }
}

// Room for the largest definition the release carries: an Agent definition holds up to 32 sections of 10,000 bytes.
const DOCUMENT_LIMITS = {
  maxBytes: 512 * 1024,
  maxDepth: 24,
  maxItems: 16384,
  maxMembers: 16384,
  maxStringLength: 16384,
  maxNumberLength: 32,
}

/** A definition the release carries, as the body of its official asset; the release refuses to start without it. */
export function releaseDocument(value: unknown): JsonValue {
  const read = readBodyText(JSON.stringify(value), DOCUMENT_LIMITS)
  if (read.kind !== 'ok') throw new Error(`a release definition is not a document: ${read.kind}`)
  return read.value
}

export function holdingKey(
  scope: SecretScope,
  holding: SettingsHolding,
  item: string,
): SecretBindingKey {
  return { scope, target: secretItemTarget(holding, item), purpose: SETTING_SECRET_PURPOSE }
}
