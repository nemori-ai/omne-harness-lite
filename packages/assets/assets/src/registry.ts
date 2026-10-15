import type { BodyContract, CategoryRegistry, JsonValue } from './identity.ts'

export function createCategoryRegistry(): CategoryRegistry {
  const ports = new Map<string, BodyContract>()
  return Object.freeze({
    register(contract: BodyContract): void {
      const category = contract.category
      if (category === '') throw new TypeError('category name is empty')
      if (ports.has(category)) throw new TypeError('category already registered')
      ports.set(category, Object.freeze({ ...contract, category, schema: freezeJson(contract.schema) }))
    },
    lookup(category: string): BodyContract | undefined {
      return ports.get(category)
    },
  })
}

export function unknownCategory(
  registry: CategoryRegistry,
  category: string,
): { readonly ok: true; readonly contract: BodyContract } | { readonly ok: false; readonly rejected: 'unknown-category' } {
  const contract = registry.lookup(category)
  if (contract === undefined) return { ok: false, rejected: 'unknown-category' }
  return { ok: true, contract }
}

function freezeJson(value: JsonValue): JsonValue {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return Object.freeze(value.map(item => freezeJson(item)))
  const copy: { [key: string]: JsonValue } = {}
  for (const [key, item] of Object.entries(value)) copy[key] = freezeJson(item)
  return Object.freeze(copy)
}
