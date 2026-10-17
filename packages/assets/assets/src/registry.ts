import type { BodyContract, CategoryRegistry } from './identity.ts'
import { copyTree } from './read-body.ts'

export function createCategoryRegistry(): CategoryRegistry {
  const ports = new Map<string, BodyContract>()
  return Object.freeze({
    register(contract: BodyContract): void {
      const category = contract.category
      if (category === '') throw new TypeError('category name is empty')
      if (ports.has(category)) throw new TypeError('category already registered')
      const schema = copyTree(contract.schema, false)
      if (schema === undefined) throw new TypeError('schema could not be copied')
      ports.set(category, Object.freeze({ ...contract, category, schema }))
    },
    lookup(category: string): BodyContract | undefined {
      return ports.get(category)
    },
  })
}

export function unknownCategory(
  registry: CategoryRegistry,
  category: string,
):
  | { readonly ok: true; readonly contract: BodyContract }
  | { readonly ok: false; readonly rejected: 'unknown-category' } {
  const contract = registry.lookup(category)
  if (contract === undefined) return { ok: false, rejected: 'unknown-category' }
  return { ok: true, contract }
}
