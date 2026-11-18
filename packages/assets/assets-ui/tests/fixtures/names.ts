import type { CategoryNames } from '../../src/model/category-names.ts'

export function namesOf(names: Readonly<Record<string, string>>): CategoryNames {
  return { read: async () => new Map(Object.entries(names)) }
}
