// The three port suites run on the memory doubles of `./testing`. The proof that the suites go red
// on a double that discloses an identity is in `conformance-red.spec.ts`.
import { describe, expect, it } from 'vitest'
import {
  describeSkillPackageSourceConformance,
  describeSkillReadCheckConformance,
  describeSkillResolutionConformance,
} from '@omne-harness/skill-contract/testing'
import {
  alice,
  earlierBasis,
  memoryReadCheck,
  memoryResolution,
  memorySource,
  readCheckSamples,
  resolutionSamples,
  reviewCapability,
  scope,
  sourceSamples,
} from './conformance-world.ts'

describeSkillPackageSourceConformance({
  name: 'memory source',
  create: memorySource,
  samples: sourceSamples,
})

describeSkillResolutionConformance({
  name: 'memory resolution',
  create: memoryResolution,
  samples: resolutionSamples,
})

describeSkillReadCheckConformance({
  name: 'memory read check',
  create: memoryReadCheck,
  samples: readCheckSamples,
})

describe('memory resolution beyond the suite', () => {
  it('resolves a basis of an earlier lawful version to that version', async () => {
    const answer = await memoryResolution().resolve(alice, scope, reviewCapability, {
      basis: earlierBasis,
    })
    expect(answer).toMatchObject({ kind: 'adopted', ref: { digest: earlierBasis.digest } })
  })

  it('does not accept a basis without the asset version when the layer differs', async () => {
    const { assetVersion: _dropped, ...basis } = earlierBasis
    const answer = await memoryResolution().resolve(alice, scope, reviewCapability, {
      basis: { ...basis, layer: 'workspace' },
    })
    expect(answer).toEqual({ kind: 'basis-not-lawful' })
  })

  it('accepts a basis without the asset version by layer and digest', async () => {
    const { assetVersion: _dropped, ...basis } = earlierBasis
    const answer = await memoryResolution().resolve(alice, scope, reviewCapability, { basis })
    expect(answer).toMatchObject({ kind: 'adopted', ref: { digest: earlierBasis.digest } })
  })
})
