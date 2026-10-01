import { capabilityCanonicalString, USABLE_BY_DECLARATION } from '@omne-harness-lite/asset-model'
import {
  copyJsonValue,
  isJsonNumber,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { judgeAgentDefinitionBody } from '@omne-harness-lite/agent-definition'
import agentSchema from '@omne-harness-lite/agent-definition/schema' with { type: 'json' }
import { assetJudge } from './defaults.ts'
import { object } from './json.ts'
import type { EffectiveAssembly, EffectiveValue } from './types.ts'

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
  definition: Parameters<typeof assetJudge.judgeAssetValue>[0],
  value: unknown,
): boolean {
  return 'ok' in assetJudge.judgeAssetValue(definition, value)
}
function capability(value: unknown): boolean {
  return data('CapabilityId', value)
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
function permission(value: JsonValue, allowed: readonly string[]): boolean {
  return (
    data('PermissionValue', value) &&
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

function dtoShape(value: JsonValue): boolean {
  if (
    !closed(value, ['root', 'assets', 'composition', 'values', 'filteredOut', 'unresolved']) ||
    !capability(value.root) ||
    !object(value.root) ||
    value.root.category !== 'agent_definition'
  )
    return false
  for (const name of ['assets', 'composition', 'values', 'filteredOut', 'unresolved'])
    if (!Array.isArray(value[name])) return false
  if (
    !Array.isArray(value.assets) ||
    !Array.isArray(value.composition) ||
    !Array.isArray(value.values) ||
    !Array.isArray(value.filteredOut) ||
    !Array.isArray(value.unresolved)
  )
    return false
  for (const asset of value.assets) {
    if (
      !closed(
        asset,
        ['capability', 'asset', 'version', 'from', 'replaced'],
        ['lockedAt', 'resident'],
      ) ||
      !capability(asset.capability) ||
      !data('AssetRecordId', asset.asset) ||
      !positiveInteger(asset.version) ||
      !member(asset.from, holdingLayers) ||
      !Array.isArray(asset.replaced) ||
      !asset.replaced.every(layer => member(layer, holdingLayers)) ||
      new Set(asset.replaced).size !== asset.replaced.length ||
      (Object.hasOwn(asset, 'lockedAt') &&
        !member(asset.lockedAt, ['factory', 'organization', 'tenant'])) ||
      (Object.hasOwn(asset, 'resident') && typeof asset.resident !== 'boolean')
    )
      return false
  }
  if (!value.composition.every(capability)) return false
  for (const item of value.values)
    if (
      !closed(
        item,
        ['capability', 'item', 'value', 'from'],
        ['lockedAt', 'provenance', 'tenantAutoWritable'],
      ) ||
      !capability(item.capability) ||
      typeof item.item !== 'string' ||
      item.item.length === 0 ||
      !member(item.from, layers) ||
      (Object.hasOwn(item, 'lockedAt') &&
        !member(item.lockedAt, ['organization', 'tenant', 'session'])) ||
      (Object.hasOwn(item, 'provenance') && !member(item.provenance, layers)) ||
      (Object.hasOwn(item, 'tenantAutoWritable') && typeof item.tenantAutoWritable !== 'boolean')
    )
      return false
  for (const item of value.filteredOut)
    if (
      !closed(item, ['capability', 'from', 'reason']) ||
      !capability(item.capability) ||
      !member(item.from, holdingLayers) ||
      !member(item.reason, reasons)
    )
      return false
  for (const item of value.unresolved)
    if (
      !closed(item, ['capability'], ['referencedBy']) ||
      !capability(item.capability) ||
      (Object.hasOwn(item, 'referencedBy') && !capability(item.referencedBy))
    )
      return false
  return true
}

/** S-47 checks only represented result facts. It cannot establish source, current authorization or evaluation correctness. */
export function judgeEffectiveAssembly(value: unknown): boolean {
  const copied = copyJsonValue(value)
  if ('failed' in copied || !dtoShape(copied.ok)) return false
  // All represented DTO fields have been admitted above; open JSON value slots stay untouched.
  const assembly = copied.ok as unknown as EffectiveAssembly
  const key = capabilityCanonicalString
  const root = key(assembly.root)
  const composition = new Set(assembly.composition.map(key))
  const assets = new Map(assembly.assets.map(asset => [key(asset.capability), asset]))
  const tuple = (...items: readonly (string | null)[]): string => JSON.stringify(items)
  if (
    !unique(assembly.assets, item => key(item.capability)) ||
    !unique(assembly.composition, key) ||
    !unique(assembly.values, item => tuple(key(item.capability), item.item)) ||
    !unique(assembly.filteredOut, item => tuple(key(item.capability), item.from, item.reason)) ||
    !unique(assembly.unresolved, item =>
      tuple(key(item.capability), item.referencedBy === undefined ? null : key(item.referencedBy)),
    )
  )
    return false
  if (
    composition.has(root) ||
    assembly.composition.some(
      cap =>
        !assets.has(key(cap)) || cap.category === 'plugin' || cap.category === 'agent_definition',
    )
  )
    return false
  if (
    assembly.values.some(
      item =>
        item.item === 'disabled' ||
        (!composition.has(key(item.capability)) &&
          !(key(item.capability) === root && assets.has(root))),
    )
  )
    return false
  if (!assets.has(root)) {
    if (
      assembly.composition.length !== 0 ||
      assembly.values.length !== 0 ||
      assembly.unresolved.length !== 1 ||
      key(assembly.unresolved[0]?.capability ?? assembly.root) !== root ||
      assembly.unresolved[0]?.referencedBy !== undefined
    )
      return false
  } else if (
    assembly.unresolved.some(
      item =>
        assets.has(key(item.capability)) ||
        item.referencedBy === undefined ||
        (key(item.referencedBy) !== root && !composition.has(key(item.referencedBy))),
    )
  )
    return false
  for (const asset of assembly.assets) {
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
      composition.has(key(asset.capability)) &&
      (asset.capability.category === 'tool' || asset.capability.category === 'skill')
    if (Object.hasOwn(asset, 'resident') !== resident) return false
  }
  for (const filtered of assembly.filteredOut) {
    if (filtered.reason.startsWith('workspace_')) {
      if (filtered.from !== 'workspace') return false
    } else {
      if (filtered.from === 'factory') return false
      const selected = assets.get(key(filtered.capability))
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
    }
  }
  const usableDomain =
    USABLE_BY_DECLARATION.kind === 'permission' ? USABLE_BY_DECLARATION.domain.values : []
  for (const capability of assembly.composition) {
    const usable = assembly.values.find(
      item => key(item.capability) === key(capability) && item.item === 'usableBy',
    )
    if (
      usable === undefined ||
      !permission(usable.value, usableDomain) ||
      usable.from === 'workspace' ||
      Object.hasOwn(usable, 'provenance') ||
      Object.hasOwn(usable, 'tenantAutoWritable')
    )
      return false
  }
  for (const item of assembly.values) {
    const asset = assets.get(key(item.capability))
    if (asset === undefined) return false
    if (key(item.capability) === root) {
      if (
        !rootValue(item) ||
        Object.hasOwn(item, 'provenance') ||
        Object.hasOwn(item, 'tenantAutoWritable') ||
        (item.lockedAt !== undefined && item.lockedAt !== item.from)
      )
        return false
    }
    if (
      item.provenance !== undefined &&
      (item.from === 'workspace' ||
        item.provenance !== (item.from === 'factory' ? asset.from : item.from) ||
        Object.hasOwn(item, 'tenantAutoWritable'))
    )
      return false
    if (
      item.tenantAutoWritable !== undefined &&
      (!['tool', 'mcp'].includes(item.capability.category) ||
        !permission(item.value, ['forbid', 'auto', 'ask']) ||
        item.from === 'workspace' ||
        (asset.from === 'workspace' && item.tenantAutoWritable))
    )
      return false
    if (
      item.capability.category === 'mcp' &&
      item.item.startsWith('execute:') &&
      item.item.length > 8 &&
      (item.tenantAutoWritable !== false || Object.hasOwn(item, 'provenance'))
    )
      return false
  }
  return true
}
