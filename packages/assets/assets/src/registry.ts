import type { JsonValue } from '@omne-harness/json-text'
import type { BodyContract, CategoryRegistry } from './identity.ts'

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
  if (value.kind === 'array') {
    return Object.freeze({ kind: 'array', items: Object.freeze(value.items.map(item => freezeJson(item))) })
  }
  if (value.kind === 'object') {
    return Object.freeze({
      kind: 'object',
      entries: Object.freeze(
        value.entries.map(entry => Object.freeze({ key: entry.key, value: freezeJson(entry.value) })),
      ),
    })
  }
  return Object.freeze(value)
}
