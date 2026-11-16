import { capabilityId, type CapabilityId } from '@omne-harness/assets'
import {
  isAssetVersion,
  isPackageDigest,
  isSafeReason,
  isSettingCategory,
  isSkillDescription,
  isSkillName,
  type DeclaredProjection,
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
      const ref = text(fieldOf(value, 'ref'))
      return isPackageDigest(digest) && ref !== undefined
        ? Object.freeze({ kind: 'content-store', digest, ref })
        : undefined
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

function settingOf(value: unknown): SettingDeclaration | undefined {
  const name = text(fieldOf(value, 'name'))
  const category = fieldOf(value, 'category')
  if (name === undefined || !isSettingCategory(category)) return undefined
  return Object.freeze({ name, category })
}

function declaredOf(value: unknown): DeclaredProjection | undefined {
  const name = fieldOf(value, 'name')
  const description = optional(value, 'description', guarded(isSkillDescription))
  const tools = listOf(fieldOf(value, 'tools'), capabilityOf)
  const settings = listOf(fieldOf(value, 'settings'), settingOf)
  if (
    !isSkillName(name) ||
    description === undefined ||
    tools === undefined ||
    settings === undefined
  )
    return undefined
  return Object.freeze({ name, ...description, tools, settings })
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
