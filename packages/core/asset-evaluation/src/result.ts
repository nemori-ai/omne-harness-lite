import {
  capabilityCanonicalString,
  USABLE_BY_DECLARATION,
  type CapabilityId,
  type AssetModelJudge,
} from '@omne-harness-lite/asset-model'
import {
  copyJsonValue,
  isJsonNumber,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { judgeAgentDefinitionBody } from '@omne-harness-lite/agent-definition'
import agentSchema from '@omne-harness-lite/agent-definition/schema' with { type: 'json' }
import { getAssetJudge } from './defaults.ts'
import { object } from './json.ts'
import type { EffectiveAsset, EffectiveAssembly, EffectiveValue, FilteredOut } from './types.ts'

const holdingLayers = ['factory', 'organization', 'tenant', 'workspace'] as const
const layers = [...holdingLayers, 'session'] as const
const reasons = [
  'disabled',
  'not_usable',
  'locked_below',
  'workspace_permission',
  'workspace_placement',
  'workspace_governance',
] as const
const rootItems = ['first_token_wait_limit', 'post_first_token_stall_limit', 'model'] as const
const key = capabilityCanonicalString
const tuple = (...items: readonly (string | null)[]): string => JSON.stringify(items)
function member(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === 'string' && allowed.includes(value)
}
function closed(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): value is JsonObject {
  return (
    object(value) &&
    required.every(name => Object.hasOwn(value, name)) &&
    Object.keys(value).every(name => required.includes(name) || optional.includes(name))
  )
}
function data(
  judge: AssetModelJudge,
  definition: Parameters<AssetModelJudge['judgeAssetValue']>[0],
  value: unknown,
): boolean {
  return 'ok' in judge.judgeAssetValue(definition, value)
}
function capability(judge: AssetModelJudge, value: unknown): boolean {
  return data(judge, 'CapabilityId', value)
}
function positiveInteger(value: unknown): boolean {
  return (
    isJsonNumber(value) &&
    ExactDecimal.from(value).isInteger &&
    ExactDecimal.from(value).compare(ExactDecimal.from(0)) > 0
  )
}
function unique<T>(values: readonly T[], key: (value: T) => string): boolean {
  return new Set(values.map(key)).size === values.length
}
function permission(judge: AssetModelJudge, value: JsonValue, allowed: readonly string[]): boolean {
  return (
    data(judge, 'PermissionValue', value) &&
    object(value) &&
    Array.isArray(value.allowed) &&
    value.allowed.every(token => typeof token === 'string' && allowed.includes(token))
  )
}
function rootValue(value: EffectiveValue): boolean {
  if (!member(value.item, rootItems)) return false
  const rules = agentSchema.$defs.AgentDefinitionBody.properties.attributes.items.allOf[1]?.oneOf
  const rule = rules?.[value.item === 'model' ? 1 : 0]
  if (rule === undefined) throw new Error('AD1 normative declaration resource is incomplete')
  const input = copyJsonValue({
    references: [],
    attributes: [
      {
        item: value.item,
        kind: 'setting',
        category: value.item === 'model' ? 'binding' : 'preference',
        domain: rule.properties.domain.const,
        default: value.value,
      },
    ],
  })
  if ('failed' in input) throw new Error('validated result could not form a JSON declaration')
  return 'ok' in judgeAgentDefinitionBody(input.ok)
}

/** EffectiveAsset members: closed set, capability, record id, positive version and a holding layer. */
function assetIdentityShape(judge: AssetModelJudge, asset: JsonValue): asset is JsonObject {
  return (
    closed(
      asset,
      ['capability', 'asset', 'version', 'from', 'replaced'],
      ['lockedAt', 'resident'],
    ) &&
    capability(judge, asset.capability) &&
    data(judge, 'AssetRecordId', asset.asset) &&
    positiveInteger(asset.version) &&
    member(asset.from, holdingLayers)
  )
}
/** EffectiveAsset layer members: distinct replaced holding layers, a lockable lockedAt, a boolean resident. */
function assetLayersShape(asset: JsonObject): boolean {
  return (
    Array.isArray(asset.replaced) &&
    asset.replaced.every(layer => member(layer, holdingLayers)) &&
    new Set(asset.replaced).size === asset.replaced.length &&
    (!Object.hasOwn(asset, 'lockedAt') ||
      member(asset.lockedAt, ['factory', 'organization', 'tenant'])) &&
    (!Object.hasOwn(asset, 'resident') || typeof asset.resident === 'boolean')
  )
}
/** EffectiveValue members: closed set, capability, non-empty item and a layer. */
function valueIdentityShape(judge: AssetModelJudge, item: JsonValue): item is JsonObject {
  return (
    closed(
      item,
      ['capability', 'item', 'value', 'from'],
      ['lockedAt', 'provenance', 'tenantAutoWritable'],
    ) &&
    capability(judge, item.capability) &&
    typeof item.item === 'string' &&
    item.item.length > 0 &&
    member(item.from, layers)
  )
}
/** EffectiveValue metadata: lockedAt in a locking layer, provenance a layer, tenantAutoWritable a boolean. */
function valueMetadataShape(item: JsonObject): boolean {
  return (
    (!Object.hasOwn(item, 'lockedAt') ||
      member(item.lockedAt, ['organization', 'tenant', 'session'])) &&
    (!Object.hasOwn(item, 'provenance') || member(item.provenance, layers)) &&
    (!Object.hasOwn(item, 'tenantAutoWritable') || typeof item.tenantAutoWritable === 'boolean')
  )
}
function filteredOutShape(judge: AssetModelJudge, item: JsonValue): boolean {
  return (
    closed(item, ['capability', 'from', 'reason']) &&
    capability(judge, item.capability) &&
    member(item.from, holdingLayers) &&
    member(item.reason, reasons)
  )
}
function unresolvedShape(judge: AssetModelJudge, item: JsonValue): boolean {
  return (
    closed(item, ['capability'], ['referencedBy']) &&
    capability(judge, item.capability) &&
    (!Object.hasOwn(item, 'referencedBy') || capability(judge, item.referencedBy))
  )
}
function assetShape(judge: AssetModelJudge, asset: JsonValue): boolean {
  return assetIdentityShape(judge, asset) && assetLayersShape(asset)
}
function valueShape(judge: AssetModelJudge, item: JsonValue): boolean {
  return valueIdentityShape(judge, item) && valueMetadataShape(item)
}
/** The five collections are arrays whose every entry has its DTO shape. */
function collectionsShape(judge: AssetModelJudge, value: JsonObject): boolean {
  const { assets, composition, values, filteredOut, unresolved } = value
  if (
    !Array.isArray(assets) ||
    !Array.isArray(composition) ||
    !Array.isArray(values) ||
    !Array.isArray(filteredOut) ||
    !Array.isArray(unresolved)
  )
    return false
  return (
    assets.every(value => assetShape(judge, value)) &&
    composition.every(value => capability(judge, value)) &&
    values.every(value => valueShape(judge, value)) &&
    filteredOut.every(value => filteredOutShape(judge, value)) &&
    unresolved.every(value => unresolvedShape(judge, value))
  )
}
/** S-47 member table: the closed DTO positions and their value types; open JSON slots stay untouched. */
function dtoShape(judge: AssetModelJudge, value: JsonValue): boolean {
  return (
    closed(value, ['root', 'assets', 'composition', 'values', 'filteredOut', 'unresolved']) &&
    capability(judge, value.root) &&
    object(value.root) &&
    value.root.category === 'agent_definition' &&
    collectionsShape(judge, value)
  )
}

/** Local indexes over an admitted DTO, shared by the relation checks. */
interface AssemblyIndex {
  readonly root: string
  readonly composition: ReadonlySet<string>
  readonly assets: ReadonlyMap<string, EffectiveAsset>
}
/** S-47 clause 1: each of the five collections is unique under its own key. */
function uniqueMembers(assembly: EffectiveAssembly): boolean {
  return (
    unique(assembly.assets, item => key(item.capability)) &&
    unique(assembly.composition, key) &&
    unique(assembly.values, item => tuple(key(item.capability), item.item)) &&
    unique(assembly.filteredOut, item => tuple(key(item.capability), item.from, item.reason)) &&
    unique(assembly.unresolved, item =>
      tuple(key(item.capability), item.referencedBy === undefined ? null : key(item.referencedBy)),
    )
  )
}
/** S-47 clause 2: the composition excludes the root, has an asset per member, and no plugin or agent definition. */
function compositionMembers(assembly: EffectiveAssembly, index: AssemblyIndex): boolean {
  return (
    !index.composition.has(index.root) &&
    !assembly.composition.some(
      cap =>
        !index.assets.has(key(cap)) ||
        cap.category === 'plugin' ||
        cap.category === 'agent_definition',
    )
  )
}
/** S-47 clause 2: values belong to the composition or to the effective root, and never to `disabled`. */
function valuesBelongToComposition(assembly: EffectiveAssembly, index: AssemblyIndex): boolean {
  return !assembly.values.some(
    item =>
      item.item === 'disabled' ||
      (!index.composition.has(key(item.capability)) &&
        !(key(item.capability) === index.root && index.assets.has(index.root))),
  )
}
/** S-47 clause 3 without an effective root: nothing composed or valued, exactly the root unresolved without a referrer. */
function missingRootOnly(assembly: EffectiveAssembly, root: string): boolean {
  return (
    assembly.composition.length === 0 &&
    assembly.values.length === 0 &&
    assembly.unresolved.length === 1 &&
    key(assembly.unresolved[0]?.capability ?? assembly.root) === root &&
    assembly.unresolved[0]?.referencedBy === undefined
  )
}
/** S-47 clause 3 with an effective root: each unresolved entry lacks an asset and is referenced by the root or a member. */
function unresolvedReferences(assembly: EffectiveAssembly, index: AssemblyIndex): boolean {
  return !assembly.unresolved.some(
    item =>
      index.assets.has(key(item.capability)) ||
      item.referencedBy === undefined ||
      (key(item.referencedBy) !== index.root && !index.composition.has(key(item.referencedBy))),
  )
}
/** S-47 clause 4: replaced layers lie outside `from`, the lock bounds both, resident appears exactly on composed tools and skills. */
function assetRelations(asset: EffectiveAsset, index: AssemblyIndex): boolean {
  const from = holdingLayers.indexOf(asset.from)
  if (asset.replaced.some(layer => holdingLayers.indexOf(layer) >= from)) return false
  if (
    asset.lockedAt !== undefined &&
    (holdingLayers.indexOf(asset.lockedAt) > from ||
      asset.replaced.some(
        layer =>
          holdingLayers.indexOf(layer) >= holdingLayers.indexOf(asset.lockedAt ?? asset.from),
      ))
  )
    return false
  const resident =
    index.composition.has(key(asset.capability)) &&
    (asset.capability.category === 'tool' || asset.capability.category === 'skill')
  return Object.hasOwn(asset, 'resident') === resident
}
/** S-47 clause 5 for a non-workspace trace: not from the factory, below the selection, and below its lock when locked out. */
function filteredBelowSelection(
  filtered: FilteredOut,
  selected: EffectiveAsset | undefined,
): boolean {
  if (filtered.from === 'factory') return false
  if (
    selected !== undefined &&
    (selected.from === filtered.from || selected.replaced.includes(filtered.from))
  )
    return false
  if (
    filtered.reason === 'locked_below' &&
    (selected?.lockedAt === undefined ||
      holdingLayers.indexOf(filtered.from) <= holdingLayers.indexOf(selected.lockedAt))
  )
    return false
  return true
}
/** S-47 clause 5: workspace reasons come from the workspace; the others sit below the selected asset. */
function filteredOutRelations(filtered: FilteredOut, index: AssemblyIndex): boolean {
  return filtered.reason.startsWith('workspace_')
    ? filtered.from === 'workspace'
    : filteredBelowSelection(filtered, index.assets.get(key(filtered.capability)))
}
/** S-47 clause 6: every composed capability has a usableBy value in the fixed domain, not from the workspace, without metadata. */
function usableByValue(
  judge: AssetModelJudge,
  capability: CapabilityId,
  values: readonly EffectiveValue[],
): boolean {
  const usableDomain =
    USABLE_BY_DECLARATION.kind === 'permission' ? USABLE_BY_DECLARATION.domain.values : []
  const usable = values.find(
    item => key(item.capability) === key(capability) && item.item === 'usableBy',
  )
  return (
    usable !== undefined &&
    permission(judge, usable.value, usableDomain) &&
    usable.from !== 'workspace' &&
    !Object.hasOwn(usable, 'provenance') &&
    !Object.hasOwn(usable, 'tenantAutoWritable')
  )
}
/** S-47 clause 6: a root value is one of the three AD1 items, without metadata, locked only where it comes from. */
function rootValueRelations(item: EffectiveValue): boolean {
  return (
    rootValue(item) &&
    !Object.hasOwn(item, 'provenance') &&
    !Object.hasOwn(item, 'tenantAutoWritable') &&
    (item.lockedAt === undefined || item.lockedAt === item.from)
  )
}
/** S-47 clause 7: provenance never comes from the workspace, names the asset's layer for factory values, and excludes tenantAutoWritable. */
function provenanceRelation(item: EffectiveValue, asset: EffectiveAsset): boolean {
  return (
    item.provenance === undefined ||
    (item.from !== 'workspace' &&
      item.provenance === (item.from === 'factory' ? asset.from : item.from) &&
      !Object.hasOwn(item, 'tenantAutoWritable'))
  )
}
/** S-47 clause 7: tenantAutoWritable sits only on tool or mcp execution permissions outside the workspace, false for workspace assets. */
function tenantAutoWritableRelation(
  judge: AssetModelJudge,
  item: EffectiveValue,
  asset: EffectiveAsset,
): boolean {
  return (
    item.tenantAutoWritable === undefined ||
    (['tool', 'mcp'].includes(item.capability.category) &&
      permission(judge, item.value, ['forbid', 'auto', 'ask']) &&
      item.from !== 'workspace' &&
      !(asset.from === 'workspace' && item.tenantAutoWritable))
  )
}
/** S-47 last paragraph: an mcp per-action execute item is never tenant-writable and carries no provenance. */
function mcpExecuteRelation(item: EffectiveValue): boolean {
  return (
    item.capability.category !== 'mcp' ||
    !item.item.startsWith('execute:') ||
    item.item.length <= 8 ||
    (item.tenantAutoWritable === false && !Object.hasOwn(item, 'provenance'))
  )
}
/** S-47 clauses 6 and 7 for one value: it has an asset, root values obey AD1, metadata obeys its position. */
function valueRelations(
  judge: AssetModelJudge,
  item: EffectiveValue,
  index: AssemblyIndex,
): boolean {
  const asset = index.assets.get(key(item.capability))
  if (asset === undefined) return false
  return (
    (key(item.capability) !== index.root || rootValueRelations(item)) &&
    provenanceRelation(item, asset) &&
    tenantAutoWritableRelation(judge, item, asset) &&
    mcpExecuteRelation(item)
  )
}

/** S-47 clause 3: with an effective root every unresolved entry is a dangling reference; without one, only the root is unresolved. */
function rootResolution(assembly: EffectiveAssembly, index: AssemblyIndex): boolean {
  return index.assets.has(index.root)
    ? unresolvedReferences(assembly, index)
    : missingRootOnly(assembly, index.root)
}
/** S-47 clauses 2～7: the relations between the five collections. */
function memberRelations(
  judge: AssetModelJudge,
  assembly: EffectiveAssembly,
  index: AssemblyIndex,
): boolean {
  return (
    compositionMembers(assembly, index) &&
    valuesBelongToComposition(assembly, index) &&
    rootResolution(assembly, index) &&
    assembly.assets.every(asset => assetRelations(asset, index)) &&
    assembly.filteredOut.every(filtered => filteredOutRelations(filtered, index)) &&
    assembly.composition.every(capability => usableByValue(judge, capability, assembly.values)) &&
    assembly.values.every(item => valueRelations(judge, item, index))
  )
}

/** S-47 checks only represented result facts. It cannot establish source, current authorization or evaluation correctness. */
export function judgeEffectiveAssemblyWithJudge(judge: AssetModelJudge, value: unknown): boolean {
  const copied = copyJsonValue(value)
  if ('failed' in copied || !dtoShape(judge, copied.ok)) return false
  // All represented DTO fields have been admitted above; open JSON value slots stay untouched.
  const assembly = copied.ok as unknown as EffectiveAssembly
  const index: AssemblyIndex = {
    root: key(assembly.root),
    composition: new Set(assembly.composition.map(key)),
    assets: new Map(assembly.assets.map(asset => [key(asset.capability), asset])),
  }
  return uniqueMembers(assembly) && memberRelations(judge, assembly, index)
}

export function judgeEffectiveAssembly(value: unknown): boolean {
  return judgeEffectiveAssemblyWithJudge(getAssetJudge(), value)
}
