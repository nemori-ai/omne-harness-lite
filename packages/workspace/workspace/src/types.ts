import type { ManagementType, ManagementTypes } from '@omne-harness/workspace-contract'

/** The types contributed now. The governance layer asks them; it never names one. */
export interface TypeLookup {
  named(name: string): ManagementType | null
  /** Every type, the one that extends the most first. */
  specificFirst(): readonly ManagementType[]
}

export function createManagementTypes(): ManagementTypes & TypeLookup {
  const types = new Map<string, ManagementType>()

  /** How many types this one extends, directly or not. A missing or cyclic parent ends the count. */
  function depth(type: ManagementType): number {
    const seen = new Set<string>([type.name])
    let parent = type.extends
    while (parent !== null && !seen.has(parent)) {
      seen.add(parent)
      parent = types.get(parent)?.extends ?? null
    }
    return seen.size - 1
  }

  return {
    contribute(type) {
      if (types.has(type.name))
        throw new Error(`a management type named ${type.name} is already contributed`)
      types.set(type.name, type)
      return {
        release() {
          if (types.get(type.name) === type) types.delete(type.name)
        },
      }
    },
    named: name => types.get(name) ?? null,
    specificFirst: () =>
      [...types.values()].sort((a, b) => depth(b) - depth(a) || a.name.localeCompare(b.name)),
  }
}
