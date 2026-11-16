import { capabilityId, type CapabilityId, type JsonValue } from '@omne-harness/assets'
import {
  DECLARATION_LIMITS,
  isAssetVersion,
  isPackageDigest,
  isPackagePath,
  isSafeReason,
  isSkillDescription,
  isSkillName,
  type DeclaredProjection,
  type ScriptDeclaration,
  type SettingCategory,
  type SettingDeclaration,
  type SourceLayer,
  type StandIn,
} from '@omne-harness/skill-contract'
import type { PackageLocator, SkillRef } from '@omne-harness/skill-contract/provider'

export function has<K extends string>(
  value: unknown,
  key: K,
): value is Readonly<Record<K, unknown>> {
  return typeof value === 'object' && value !== null && Object.hasOwn(value, key)
}

export function fieldOf<K extends string>(value: unknown, key: K): unknown {
  return has(value, key) ? value[key] : undefined
}

function guarded<T>(guard: (value: unknown) => value is T): (value: unknown) => T | undefined {
  return value => (guard(value) ? value : undefined)
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function optional<K extends string, T>(
  value: unknown,
  key: K,
  parse: (field: unknown) => T | undefined,
): Partial<Readonly<Record<K, T>>> | undefined {
  const field = fieldOf(value, key)
  if (field === undefined) return {}
  const parsed = parse(field)
  if (parsed === undefined) return undefined
  const one: Partial<Record<K, T>> = {}
  one[key] = parsed
  return one
}

export function listOf<T>(
  value: unknown,
  parse: (item: unknown) => T | undefined,
): readonly T[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items: T[] = []
  for (const item of value) {
    const parsed = parse(item)
    if (parsed === undefined) return undefined
    items.push(parsed)
  }
  return Object.freeze(items)
}

export function capabilityOf(value: unknown): CapabilityId | undefined {
  const category = fieldOf(value, 'category')
  const name = fieldOf(value, 'name')
  if (typeof category !== 'string' || typeof name !== 'string') return undefined
  const id = capabilityId(category, name)
  return id.ok ? id.id : undefined
}

function layerOf(value: unknown): SourceLayer | undefined {
  switch (value) {
    case 'official':
    case 'organization':
    case 'tenant':
    case 'workspace':
      return value
  }
  return undefined
}

function locatorOf(value: unknown): PackageLocator | undefined {
  switch (fieldOf(value, 'kind')) {
    case 'directory': {
      const root = text(fieldOf(value, 'root'))
      return root === undefined ? undefined : Object.freeze({ kind: 'directory', root })
    }
    case 'content-store': {
      const digest = fieldOf(value, 'digest')
      return isPackageDigest(digest) ? Object.freeze({ kind: 'content-store', digest }) : undefined
    }
  }
  return undefined
}

function refOf(value: unknown): SkillRef | undefined {
  const capability = capabilityOf(fieldOf(value, 'capability'))
  const layer = layerOf(fieldOf(value, 'layer'))
  const locator = locatorOf(fieldOf(value, 'locator'))
  const assetVersion = optional(value, 'assetVersion', guarded(isAssetVersion))
  const digest = optional(value, 'digest', guarded(isPackageDigest))
  if (
    capability === undefined ||
    layer === undefined ||
    locator === undefined ||
    assetVersion === undefined ||
    digest === undefined
  )
    return undefined
  return Object.freeze({ capability, layer, ...assetVersion, locator, ...digest })
}

const PARAMETERS_DEPTH = DECLARATION_LIMITS.maxDepth
const JSON_NUMBER = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/
const NULL_NODE: JsonValue = Object.freeze({ kind: 'null' })

type JsonEntry = Extract<JsonValue, { kind: 'object' }>['entries'][number]

// `above` counts the containers above the node; past `PARAMETERS_DEPTH` the tree is too deep,
// so the walk stays inside the budget and a cyclic tree ends there too.
function jsonTreeOf(value: unknown, above: number): JsonValue | undefined {
  switch (fieldOf(value, 'kind')) {
    case 'null':
      return NULL_NODE
    case 'boolean': {
      const flag = fieldOf(value, 'value')
      return typeof flag === 'boolean' ? Object.freeze({ kind: 'boolean', value: flag }) : undefined
    }
    case 'string': {
      const content = text(fieldOf(value, 'value'))
      return content === undefined ? undefined : Object.freeze({ kind: 'string', value: content })
    }
    case 'number': {
      const lexeme = fieldOf(value, 'lexeme')
      return typeof lexeme === 'string' && JSON_NUMBER.test(lexeme)
        ? Object.freeze({ kind: 'number', lexeme })
        : undefined
    }
    case 'array': {
      if (above >= PARAMETERS_DEPTH) return undefined
      const items = listOf(fieldOf(value, 'items'), item => jsonTreeOf(item, above + 1))
      return items === undefined ? undefined : Object.freeze({ kind: 'array', items })
    }
    case 'object': {
      if (above >= PARAMETERS_DEPTH) return undefined
      const entries = listOf(fieldOf(value, 'entries'), entry => entryOf(entry, above + 1))
      return entries === undefined ? undefined : Object.freeze({ kind: 'object', entries })
    }
  }
  return undefined
}

function entryOf(value: unknown, above: number): JsonEntry | undefined {
  const key = text(fieldOf(value, 'key'))
  const tree = jsonTreeOf(fieldOf(value, 'value'), above)
  if (key === undefined || tree === undefined) return undefined
  return Object.freeze({ key, value: tree })
}

function scriptOf(value: unknown): ScriptDeclaration | undefined {
  const entry = fieldOf(value, 'entry')
  const runKind = text(fieldOf(value, 'runKind'))
  const facilities = listOf(fieldOf(value, 'facilities'), text)
  const parameters = optional(value, 'parameters', tree => jsonTreeOf(tree, 0))
  if (
    !isPackagePath(entry) ||
    runKind === undefined ||
    facilities === undefined ||
    parameters === undefined
  )
    return undefined
  return Object.freeze({ entry, runKind, facilities, ...parameters })
}

function settingCategoryOf(value: unknown): SettingCategory | undefined {
  switch (value) {
    case 'preference':
    case 'binding':
    case 'placement-identity':
    case 'governance':
      return value
  }
  return undefined
}

function settingOf(value: unknown): SettingDeclaration | undefined {
  const name = text(fieldOf(value, 'name'))
  const category = settingCategoryOf(fieldOf(value, 'category'))
  if (name === undefined || category === undefined) return undefined
  return Object.freeze({ name, category })
}

function declaredOf(value: unknown): DeclaredProjection | undefined {
  const name = fieldOf(value, 'name')
  const description = optional(value, 'description', guarded(isSkillDescription))
  const tools = listOf(fieldOf(value, 'tools'), capabilityOf)
  const scripts = listOf(fieldOf(value, 'scripts'), scriptOf)
  const settings = listOf(fieldOf(value, 'settings'), settingOf)
  if (
    !isSkillName(name) ||
    description === undefined ||
    tools === undefined ||
    scripts === undefined ||
    settings === undefined
  )
    return undefined
  return Object.freeze({ name, ...description, tools, scripts, settings })
}

export function adoptedOf(
  value: unknown,
): Readonly<{ kind: 'adopted'; ref: SkillRef; declared: DeclaredProjection }> | undefined {
  const ref = refOf(fieldOf(value, 'ref'))
  const declared = declaredOf(fieldOf(value, 'declared'))
  if (ref === undefined || declared === undefined) return undefined
  return Object.freeze({ kind: 'adopted', ref, declared })
}

export function standInOf(
  value: unknown,
): (StandIn & Readonly<{ kind: 'known-unavailable' }>) | undefined {
  const capability = capabilityOf(fieldOf(value, 'capability'))
  const name = fieldOf(value, 'name')
  const description = optional(value, 'description', guarded(isSkillDescription))
  const reason = fieldOf(value, 'reason')
  if (
    capability === undefined ||
    !isSkillName(name) ||
    description === undefined ||
    !isSafeReason(reason)
  )
    return undefined
  return Object.freeze({ kind: 'known-unavailable', capability, name, ...description, reason })
}
