import {
  declarationDigest,
  type ContextBlockKey,
  type StaticContribution,
  type StaticRegistration,
} from '@omne-harness/runtime-context-contract'

export interface StaticRegistry {
  /** Adds a contribution and returns what takes it back. A block declared differently throws. */
  register(contribution: StaticContribution): () => void
  current(): StaticRegistration
}

/** One column of data: a block key has one declaration, and a contribution leaves as a whole. */
export function createStaticRegistry(): StaticRegistry {
  const contributions = new Set<StaticContribution>()
  const declared = (key: ContextBlockKey) =>
    [...contributions]
      .flatMap(item => item.blocks ?? [])
      .find(block => block.declaration.key === key)?.declaration
  return {
    register(contribution) {
      for (const block of contribution.blocks ?? []) {
        const { key } = block.declaration
        const known = declared(key)
        if (
          known !== undefined &&
          declarationDigest(known) !== declarationDigest(block.declaration)
        )
          throw new Error(`the block ${key} is already contributed with another declaration`)
      }
      const own = { ...contribution }
      contributions.add(own)
      return () => {
        contributions.delete(own)
      }
    },
    current() {
      const all = [...contributions]
      return {
        blocks: all.flatMap(item => item.blocks ?? []),
        needs: all.flatMap(item => item.needs ?? []),
      }
    },
  }
}
