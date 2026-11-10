import type {
  GovernanceCollectionRef,
  GovernanceContributionRef,
  GovernanceDefinitionRef,
  GovernanceScope,
} from '@omne-harness/governance-contract'
import type { SettingsTarget } from '@omne-harness/settings'
import { canonical, digest } from './encoding.ts'

export type GovernanceCollectionMember = Readonly<{
  contribution: GovernanceContributionRef
  definition: GovernanceDefinitionRef
  selectedTargets: readonly SettingsTarget[]
}>
const sorted = <T>(values: readonly T[]) =>
  [...values].sort((a, b) => {
    const left = canonical(a),
      right = canonical(b)
    return left < right ? -1 : left > right ? 1 : 0
  })

/** Builds the wire collection reference; only the provider can verify its completeness. */
export function createGovernanceCollection(
  input: Readonly<{
    scope: GovernanceScope
    declarationRevision: number
    complete: readonly GovernanceCollectionMember[]
  }>,
): GovernanceCollectionRef {
  const scope = structuredClone(input.scope)
  return {
    scope,
    declarationRevision: input.declarationRevision,
    digest: digest({
      scope,
      declarationRevision: input.declarationRevision,
      complete: sorted(
        input.complete.map(member => ({
          contribution: member.contribution,
          definition: member.definition,
          selectedTargets: sorted(member.selectedTargets),
        })),
      ),
    }),
  }
}
