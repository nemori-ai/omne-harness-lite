// The parsers of the values inside a port answer, by the contract SPEC "端口答复的统一处置". Each
// parser takes `unknown` and gives the value of the contract type, built anew, or `undefined`
// when one part of it does not hold. A branded value comes only from its contract guard; a
// capability identity is built anew by `capabilityId`. Nothing of the port's object is kept, so
// the port cannot change a value after it was parsed.
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

/**
 * Whether `value` is an object with its own field `key`. A field on the prototype does not count:
 * a port answer is data, and data has its fields itself. The field itself is still unknown.
 */
export function has<K extends string>(
  value: unknown,
  key: K,
): value is Readonly<Record<K, unknown>> {
  return typeof value === 'object' && value !== null && Object.hasOwn(value, key)
}

/** The own field `key` of `value`, or `undefined` when `value` is no object or has no such field. */
export function fieldOf<K extends string>(value: unknown, key: K): unknown {
  return has(value, key) ? value[key] : undefined
}

/** A parser made from a guard. */
function guarded<T>(guard: (value: unknown) => value is T): (value: unknown) => T | undefined {
  return value => (guard(value) ? value : undefined)
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/**
 * An optional field: `{}` when it is absent, `{ [key]: parsed }` when it parses, and `undefined`
 * when it is present and does not parse. Absent means a missing field or the value `undefined`.
 */
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

/** Every item parsed, or `undefined` when the value is no list or one item does not parse. */
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

/** A capability identity, built anew from its category and name. */
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

/** The deepest nesting of containers in script parameters: the depth budget of a declaration. */
const PARAMETERS_DEPTH = DECLARATION_LIMITS.maxDepth
/** A JSON number by RFC 8259 section 6: the lexeme form that `@omne-harness/json-text` reads. */
const JSON_NUMBER = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/
const NULL_NODE: JsonValue = Object.freeze({ kind: 'null' })

type JsonEntry = Extract<JsonValue, { kind: 'object' }>['entries'][number]

/**
 * A JSON tree in the form that `@omne-harness/assets` reads, built anew and frozen node by node.
 * Each node keeps only the fields of its kind, and each object entry only `key` and `value`.
 * `above` counts the containers above the node; a container below `PARAMETERS_DEPTH` others is
 * too deep, so the walk never goes deeper than the budget and a cycle ends there too.
 */
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
      const lexeme = text(fieldOf(value, 'lexeme'))
      return lexeme !== undefined && JSON_NUMBER.test(lexeme)
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

/** One entry of a JSON object; `above` counts the containers above its value. */
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

/** The payload of an `adopted` answer: the reference and the declared projection. */
export function adoptedOf(
  value: unknown,
): Readonly<{ kind: 'adopted'; ref: SkillRef; declared: DeclaredProjection }> | undefined {
  const ref = refOf(fieldOf(value, 'ref'))
  const declared = declaredOf(fieldOf(value, 'declared'))
  if (ref === undefined || declared === undefined) return undefined
  return Object.freeze({ kind: 'adopted', ref, declared })
}

/** The payload of a `known-unavailable` answer: the last lawful name and description, and the reason. */
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
