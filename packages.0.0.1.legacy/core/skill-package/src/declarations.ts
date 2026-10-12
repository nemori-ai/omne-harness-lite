import type { AttributeDeclaration } from '@omne-harness-lite/asset-model'
import type { CapabilityId } from '@omne-harness-lite/content-blocks'
import type { SkillPackage } from './types.ts'

/** Valid inputs contain only JSON containers and immutable lossless numeric atoms. */
function detached<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return Object.freeze(value.map((item: unknown) => detached(item))) as T
  const prototype: unknown = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return value
  const copy: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value))
    Object.defineProperty(copy, key, { value: detached(item), enumerable: true })
  // Copying checked, typed JSON data preserves its shape; this assertion is not a validator.
  return Object.freeze(copy) as T
}

/** S-17: the body contributes only its author declarations; asset-model owns reserved items. */
export function skillAttributeDeclarations(pkg: SkillPackage): readonly AttributeDeclaration[] {
  return detached(pkg.definition?.settings ?? [])
}
export function skillReferences(pkg: SkillPackage): readonly CapabilityId[] {
  return Object.freeze(
    (pkg.definition?.tools ?? []).map(id =>
      Object.freeze({ category: id.category, name: id.name }),
    ),
  )
}
