// Two doubles that break the non-disclosure rule and nothing else. For the principal without the
// right, an identity that exists for nobody answers `unknown`, while an identity that exists answers
// as the rule asks. Every other case of the suites must still pass.
import {
  describeSkillReadCheckConformance,
  describeSkillResolutionConformance,
} from '@omne-harness/skill-contract/testing'
import {
  memoryReadCheck,
  memoryResolution,
  missingCapability,
  readCheckSamples,
  resolutionSamples,
} from '../../conformance-world.ts'

describeSkillResolutionConformance({
  name: 'resolution that discloses a missing identity',
  create: () => {
    const real = memoryResolution()
    return {
      resolve: async (access, scope, capability, options) =>
        access.principal === 'mallory' && capability.name === missingCapability.name
          ? { kind: 'unknown' }
          : real.resolve(access, scope, capability, options),
      adopted: (access, scope) => real.adopted(access, scope),
    }
  },
  samples: resolutionSamples,
})

describeSkillReadCheckConformance({
  name: 'read check that discloses a missing identity',
  create: () => {
    const real = memoryReadCheck()
    return {
      check: async (access, scope, capability) =>
        access.principal === 'mallory' && capability.name === missingCapability.name
          ? 'unknown'
          : real.check(access, scope, capability),
    }
  },
  samples: readCheckSamples,
})
