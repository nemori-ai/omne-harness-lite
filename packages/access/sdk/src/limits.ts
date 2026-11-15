import type { GovernanceCodecLimits } from '@omne-harness/public-contract'

export const defaultLimits: GovernanceCodecLimits = {
  maxBytes: 4_194_304,
  maxDepth: 64,
  maxItems: 100_000,
  maxMembers: 1_000,
  maxStringLength: 1_048_576,
  maxNumberLength: 100,
}
