// The three port suites run on the memory doubles of `./testing`, each case on a fresh fixture. A
// not-applicable case counts as a failure here: the doubles must cover every case. The same
// suites run in process on doubles that disclose whether an identity exists, and fail exactly on
// the non-disclosure cases.
import { AssertionError } from 'node:assert/strict'
import { describe, expect, it } from 'vitest'
import type { SkillReadCheck, SkillResolution } from '@omne-harness/skill-contract/provider'
import { isPackageDigest } from '@omne-harness/skill-contract'
import {
  runConformanceCase,
  skillPackageSourceConformance,
  skillReadCheckConformance,
  skillResolutionConformance,
  type ConformanceCase,
} from '@omne-harness/skill-contract/testing'
import {
  alice,
  earlierBasis,
  memoryReadCheck,
  memoryResolution,
  missingCapability,
  readCheckFixture,
  resolutionFixture,
  reviewCapability,
  scope,
  sourceFixture,
  type Principal,
  type Scope,
} from './conformance-world.ts'
import { granted } from './package-builder.ts'

const otherDigest = granted(isPackageDigest, `sha256:${'f'.repeat(64)}`)

const NO_DISCLOSURE =
  'answers a principal without the right the same for an existing and a missing identity'

function register<F>(suite: string, cases: readonly ConformanceCase<F>[], fixture: () => F): void {
  describe(suite, () => {
    for (const conformance of cases)
      it(`${conformance.clause} ${conformance.name}`, async () => {
        expect(await runConformanceCase(conformance, fixture())).toEqual({ kind: 'passed' })
      })
  })
}

/** The names of the cases that fail by an assertion. Any other error is thrown. */
async function failing<F>(
  cases: readonly ConformanceCase<F>[],
  fixture: () => F,
): Promise<string[]> {
  const failed: string[] = []
  for (const conformance of cases) {
    try {
      await conformance.run(fixture())
    } catch (error) {
      if (!(error instanceof AssertionError)) throw error
      failed.push(conformance.name)
    }
  }
  return failed
}

register(
  'SkillPackageSource conformance: memory source',
  skillPackageSourceConformance(),
  sourceFixture,
)
register(
  'SkillResolution conformance: memory resolution',
  skillResolutionConformance<Principal, Scope>(),
  () => resolutionFixture(),
)
register(
  'SkillReadCheck conformance: memory read check',
  skillReadCheckConformance<Principal, Scope>(),
  () => readCheckFixture(),
)

describe('the suites go red on a double that discloses whether an identity exists', () => {
  it('fails only the non-disclosure case of the resolution suite', async () => {
    const leaking = (): SkillResolution<Principal, Scope> => {
      const real = memoryResolution()
      return {
        resolve: async (access, at, capability, options) =>
          access.principal === 'mallory' && capability.name === missingCapability.name
            ? { kind: 'unknown' }
            : real.resolve(access, at, capability, options),
        adopted: (access, at) => real.adopted(access, at),
      }
    }
    const cases = skillResolutionConformance<Principal, Scope>()
    expect(await failing(cases, () => resolutionFixture(leaking()))).toEqual([NO_DISCLOSURE])
  })

  it('fails only the non-disclosure case of the read check suite', async () => {
    const leaking = (): SkillReadCheck<Principal, Scope> => {
      const real = memoryReadCheck()
      return {
        check: async (access, at, capability) =>
          access.principal === 'mallory' && capability.name === missingCapability.name
            ? { kind: 'unknown' }
            : real.check(access, at, capability),
      }
    }
    const cases = skillReadCheckConformance<Principal, Scope>()
    expect(await failing(cases, () => readCheckFixture(leaking()))).toEqual([NO_DISCLOSURE])
  })

  it('passes every case on the memory doubles, so the two failures above come from the leak', async () => {
    expect(
      await failing(skillResolutionConformance<Principal, Scope>(), () => resolutionFixture()),
    ).toEqual([])
    expect(
      await failing(skillReadCheckConformance<Principal, Scope>(), () => readCheckFixture()),
    ).toEqual([])
  })
})

describe('memory resolution beyond the suite', () => {
  it('resolves a basis of an earlier lawful version to that version', async () => {
    const answer = await memoryResolution().resolve(alice, scope, reviewCapability, {
      basis: earlierBasis,
    })
    expect(answer).toMatchObject({ kind: 'adopted', ref: { digest: earlierBasis.digest } })
  })

  it('checks a basis without the asset version by layer and does not compare the digest', async () => {
    const { assetVersion: _dropped, ...basis } = earlierBasis
    const answer = await memoryResolution().resolve(alice, scope, reviewCapability, {
      basis: { ...basis, digest: otherDigest },
    })
    expect(answer).toMatchObject({ kind: 'adopted', ref: { layer: 'tenant' } })
  })

  it('does not compare the digest of a basis with an asset version either', async () => {
    const answer = await memoryResolution().resolve(alice, scope, reviewCapability, {
      basis: { ...earlierBasis, digest: otherDigest },
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
})
