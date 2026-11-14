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
