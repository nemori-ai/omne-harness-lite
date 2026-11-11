import {
  GovernanceDefinitionIdentitySchema,
  type GovernanceDefinitionSource,
} from '@omne-harness/governance-contract'
import type { ToolRelease } from '../../entry/tool-release.ts'

/** The trusted release snapshot is shared across tenant consumers; local copies are not issuers. */
export function createToolGovernanceDefinitionSource(
  readRelease: () => ToolRelease,
): GovernanceDefinitionSource {
  return {
    async resolve(identity) {
      const parsed = GovernanceDefinitionIdentitySchema.safeParse(identity)
      if (!parsed.success) return { kind: 'unavailable' }
      try {
        const release = readRelease()
        if (release.kind !== 'trusted') return { kind: 'unavailable' }
        const found = release.manifest.entries.find(({ governance }) => {
          const reference = governance.declaration.reference
          return (
            reference.ownerId === parsed.data.ownerId &&
            reference.definitionId === parsed.data.definitionId &&
            reference.version === parsed.data.version
          )
        })
        return found === undefined
          ? { kind: 'unavailable' }
          : { kind: 'definition', declaration: structuredClone(found.governance.declaration) }
      } catch {
        return { kind: 'unavailable' }
      }
    },
  }
}
