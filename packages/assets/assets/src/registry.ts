import type { BodyContract, CategoryRegistry } from './identity.ts'

export function createCategoryRegistry(): CategoryRegistry {
  const ports = new Map<string, BodyContract>()
  return Object.freeze({
    register(contract: BodyContract): void {
      if (contract.category === '') throw new TypeError('category name is empty')
      if (ports.has(contract.category)) throw new TypeError('category already registered')
      ports.set(contract.category, contract)
    },
    lookup(category: string): BodyContract | undefined {
      return ports.get(category)
    },
  })
}

export function unknownCategory(
  registry: CategoryRegistry,
  category: string,
): { readonly ok: true; readonly contract: BodyContract } | { readonly rejected: 'unknown-category' } {
  const contract = registry.lookup(category)
  if (contract === undefined) return { rejected: 'unknown-category' }
  return { ok: true, contract }
}
