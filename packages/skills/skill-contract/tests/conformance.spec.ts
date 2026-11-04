// The three port suites run on the memory doubles of `./testing`, each case on a fresh fixture. A
// not-applicable case counts as a failure here: the doubles must cover every case. The same
// suites run in process on doubles that disclose whether an identity exists, and fail exactly on
// the non-disclosure cases; the resolution suite also runs on doubles whose reference names other
// material, and fails exactly on the PR1 and PR3 cases that see it.
import { AssertionError } from 'node:assert/strict'
import { describe, expect, it } from 'vitest'
import type {
  PackageLocator,
  Resolution,
  SkillReadCheck,
  SkillResolution,
} from '@omne-harness/skill-contract/provider'
import { isPackageDigest, isPackagePath } from '@omne-harness/skill-contract'
import {
  createMemorySource,
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

describe('the resolution suite goes red on a reference to other material', () => {
  /** The memory resolution with `answer` in place of each `adopted` answer of `resolve`. */
  function rewriting(
    answer: (adopted: Extract<Resolution, { kind: 'adopted' }>) => Resolution,
  ): SkillResolution<Principal, Scope> {
    const real = memoryResolution()
    return {
      resolve: async (access, at, capability, options) => {
        const given = await real.resolve(access, at, capability, options)
        return given.kind === 'adopted' ? answer(given) : given
      },
      adopted: (access, at) => real.adopted(access, at),
    }
  }

  it('fails PR1 and the two PR3 cases of the adopted material when the reference names another identity', async () => {
    const misdirecting = rewriting(given => ({
      ...given,
      ref: { ...given.ref, capability: missingCapability },
    }))
    const cases = skillResolutionConformance<Principal, Scope>()
    expect(await failing(cases, () => resolutionFixture(misdirecting))).toEqual([
      'resolves an adopted identity to its material and declarations',
      'resolves a basis of the adopted material to that material',
      'gives back the digest of the basis without comparing it',
    ])
  })

  it('fails only the PR3 digest case when the reference keeps the digest of its own material', async () => {
    const real = memoryResolution()
    const keeping: SkillResolution<Principal, Scope> = {
      adopted: (access, at) => real.adopted(access, at),
      resolve: async (access, at, capability, options) => {
        const given = await real.resolve(access, at, capability, options)
        if (given.kind !== 'adopted' || options?.basis === undefined) return given
        const plain = await real.resolve(access, at, capability)
        if (plain.kind !== 'adopted') return given
        const own = plain.ref.digest
        if (own === undefined || given.ref.assetVersion !== plain.ref.assetVersion) return given
        return { ...given, ref: { ...given.ref, digest: own } }
      },
    }
    const cases = skillResolutionConformance<Principal, Scope>()
    expect(await failing(cases, () => resolutionFixture(keeping))).toEqual([
      'gives back the digest of the basis without comparing it',
    ])
  })
})

describe('memory source links beyond the suite', () => {
  const locator: PackageLocator = { kind: 'directory', root: '/skills/linked' }
  const files = { 'SKILL.md': 'x', 'docs/a.md': 'target' }

  it('reads the bytes of the target of a link inside the root', async () => {
    const source = createMemorySource([
      { locator, rootName: 'linked', files, links: { 'docs/b.md': 'a.md' } },
    ])
    const snapshot = await source.snapshot(locator)
    if (!('ok' in snapshot)) throw new Error(snapshot.failure)
    const opened = await source.open(
      locator,
      snapshot.ok.digest,
      granted(isPackagePath, 'docs/b.md'),
    )
    expect(opened).toEqual({ ok: new TextEncoder().encode('target') })
  })

  it('answers entry-unreadable for a link whose target is not a file of the package', async () => {
    const source = createMemorySource([
      { locator, rootName: 'linked', files, links: { 'docs/b.md': 'missing.md' } },
    ])
    expect(await source.snapshot(locator)).toEqual({ failure: 'entry-unreadable' })
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

  it('does not compare the digest of a basis with an asset version either, and gives it back', async () => {
    const answer = await memoryResolution().resolve(alice, scope, reviewCapability, {
      basis: { ...earlierBasis, digest: otherDigest },
    })
    // PR3: the reference carries the digest of the basis, so Skill finds the move at the snapshot.
    expect(answer).toMatchObject({
      kind: 'adopted',
      ref: { assetVersion: earlierBasis.assetVersion, digest: otherDigest },
    })
  })

  it('does not accept a basis without the asset version when the layer differs', async () => {
    const { assetVersion: _dropped, ...basis } = earlierBasis
    const answer = await memoryResolution().resolve(alice, scope, reviewCapability, {
      basis: { ...basis, layer: 'workspace' },
    })
    expect(answer).toEqual({ kind: 'basis-not-lawful' })
  })
})
