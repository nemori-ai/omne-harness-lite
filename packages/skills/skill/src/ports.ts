// The three demand ports that `createSkillAccess` takes, as one object. Each port keeps its own
// contract and conformance suite in `@omne-harness/skill-contract`.
import type {
  SkillPackageSource,
  SkillReadCheck,
  SkillResolution,
} from '@omne-harness/skill-contract/provider'

export type SkillPorts<P, S> = Readonly<{
  readCheck: SkillReadCheck<P, S>
  resolution: SkillResolution<P, S>
  source: SkillPackageSource
}>
