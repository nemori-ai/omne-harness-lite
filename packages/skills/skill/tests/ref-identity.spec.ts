// S7, the reference names the requested material: the contract SPEC "端口答复的统一处置" and the
// member SPEC "引用身份一致". An `adopted` answer of `resolve` whose reference names another
// identity, or, with a basis, another source layer, asset version or digest than the basis, is no
// answer: the operation answers `unknown`, gives no content and calls no source. Every case goes
// through the public services.
import { describe, expect, it } from 'vitest'
import { capabilityId } from '@omne-harness/assets'
import { createSkillAccess } from '@omne-harness/skill'
import {
  isAssetVersion,
  isSafeReason,
  isSkillName,
  type SkillAccess,
  type SkillMaterialBasis,
} from '@omne-harness/skill-contract'
import type { Resolution, SkillRef } from '@omne-harness/skill-contract/provider'
import {
  alice,
  createWorld,
  currentBasis,
  currentDigest,
  earlierDigest,
  failureOf,
  granted,
  large,
  largeLocator,
  okOf,
  review,
  reviewLocator,
  scope,
  workspaceNote,
  type Principal,
  type PortCalls,
  type Scope,
} from './access-world.ts'
import { CAPABILITY, runOf } from './model/world.ts'

const UNKNOWN = { failure: { kind: 'unknown' } }

/** The reference of the current material of `review`, as the world's resolution gives it. */
const REVIEW_REF: SkillRef = {
  capability: review,
  layer: 'tenant',
  assetVersion: granted(isAssetVersion, 'v2'),
  locator: reviewLocator,
  digest: currentDigest,
}

/** The declared projection that the world's resolution gives for `review`. */
async function reviewDeclared() {
  const { ports } = createWorld()
  const answer = await ports.resolution.resolve(alice, scope, review)
  if (answer.kind !== 'adopted') throw new Error('the world does not adopt review')
  return answer.declared
}

type Lying = Readonly<{ access: SkillAccess<Principal, Scope>; calls: () => PortCalls }>

/** A world whose resolution answers `adopted` with `ref` for every request. */
async function lyingWorld(ref: SkillRef): Promise<Lying> {
  const world = createWorld()
  const declared = await reviewDeclared()
  const resolve = async (): Promise<Resolution> => ({ kind: 'adopted', ref, declared })
  const access = createSkillAccess({
    ...world.ports,
    resolution: { ...world.ports.resolution, resolve },
  })
  return { access, calls: world.controls.calls }
}

/** Every operation on `review`, with `basis` when one is given; each answer must be `unknown`. */
async function expectNoAnswer(lying: Lying, basis?: SkillMaterialBasis): Promise<void> {
  const options = basis === undefined ? {} : { basis }
  const { access } = lying
  expect(await access.describe(alice, scope, review, options)).toStrictEqual(UNKNOWN)
  expect(
    await access.read(alice, scope, { capability: review, part: { kind: 'body' } }, options),
  ).toStrictEqual(UNKNOWN)
  expect(
    await access.read(
      alice,
      scope,
      { capability: review, part: { kind: 'resource', path: 'docs/guide.md' } },
      options,
    ),
  ).toStrictEqual(UNKNOWN)
  expect(await access.list(alice, scope, review, options)).toStrictEqual(UNKNOWN)
  if (basis !== undefined)
    expect(await access.export(alice, scope, review, basis)).toStrictEqual(UNKNOWN)
  // No byte was asked for: the bad answer stops the operation at step 3.
  expect(lying.calls()).toMatchObject({ snapshot: 0, open: 0 })
}

describe('a reference that names another identity is no answer', () => {
  it('answers unknown for a reference of another Skill, with its locator and digest', async () => {
    const other: SkillRef = { ...REVIEW_REF, capability: large, locator: largeLocator }
    await expectNoAnswer(await lyingWorld(other))
    await expectNoAnswer(await lyingWorld(other), currentBasis)
  })

  it('answers unknown for a reference of the same name in another category', async () => {
    const tool = capabilityId('tool', 'review')
    if (!tool.ok) throw new Error('tool:review is no capability identity')
    await expectNoAnswer(await lyingWorld({ ...REVIEW_REF, capability: tool.id }))
  })

  it('answers unknown when the reference names another identity and the package of the requested one', async () => {
    await expectNoAnswer(await lyingWorld({ ...REVIEW_REF, capability: large }))
  })
})

describe('a stand-in of another identity is no answer', () => {
  it('answers unknown, not the name and reason of the other identity', async () => {
    const world = createWorld()
    const resolve = async (): Promise<Resolution> => ({
      kind: 'known-unavailable',
      capability: large,
      name: granted(isSkillName, 'large'),
      description: 'A long one.',
      reason: granted(isSafeReason, 'Disabled by the organization.'),
    })
    const access = createSkillAccess({
      ...world.ports,
      resolution: { ...world.ports.resolution, resolve },
    })
    expect(await access.describe(alice, scope, review)).toStrictEqual(UNKNOWN)
    expect(
      await access.read(alice, scope, { capability: review, part: { kind: 'body' } }),
    ).toStrictEqual(UNKNOWN)
  })
})

describe('with a basis, a reference to other material is no answer', () => {
  it('answers unknown for another source layer', async () => {
    await expectNoAnswer(await lyingWorld({ ...REVIEW_REF, layer: 'workspace' }), currentBasis)
  })

  it('answers unknown for another asset version', async () => {
    const v1 = granted(isAssetVersion, 'v1')
    await expectNoAnswer(await lyingWorld({ ...REVIEW_REF, assetVersion: v1 }), currentBasis)
  })

  it('answers unknown for no asset version when the basis has one', async () => {
    const { assetVersion: _dropped, ...withoutVersion } = REVIEW_REF
    await expectNoAnswer(await lyingWorld(withoutVersion), currentBasis)
  })

  it('answers unknown for another digest', async () => {
    await expectNoAnswer(await lyingWorld({ ...REVIEW_REF, digest: earlierDigest }), currentBasis)
  })
})

describe('a reference that agrees with the request passes', () => {
  it('reads with a basis when the reference carries its layer, asset version and digest', async () => {
    const { access } = await lyingWorld(REVIEW_REF)
    const page = okOf(
      await access.read(
        alice,
        scope,
        { capability: review, part: { kind: 'body' } },
        {
          basis: currentBasis,
        },
      ),
    )
    expect(page.basis).toStrictEqual(currentBasis)
  })

  it('takes the asset version of the reference when the basis has none', async () => {
    const { access } = createWorld()
    const basis: SkillMaterialBasis = {
      capability: workspaceNote,
      layer: 'workspace',
      digest: currentDigest,
    }
    const description = okOf(await access.describe(alice, scope, workspaceNote, { basis }))
    expect(description.material).toStrictEqual({ kind: 'pinned', basis })
  })

  it('answers unsupported, not unknown, for a reference without a digest under a basis', async () => {
    const { digest: _dropped, ...noPackage } = REVIEW_REF
    const { access } = await lyingWorld(noPackage)
    expect(
      failureOf(
        await access.read(
          alice,
          scope,
          { capability: review, part: { kind: 'body' } },
          {
            basis: currentBasis,
          },
        ),
      ),
    ).toStrictEqual({ kind: 'unsupported', what: 'no-readable-package' })
  })
})

describe('the reproduction of GS-06', () => {
  // alice may read alpha and not beta. The resolution answers alpha with the material of beta.
  it('gives alice nothing of beta when the resolution answers alpha with the reference of beta', async () => {
    const world = {
      alpha: {
        state: { kind: 'adopted', current: 0 },
        readers: ['alice'],
        knownTo: ['alice'],
        held: 0,
      },
      beta: { state: { kind: 'adopted', current: 0 }, readers: [], knownTo: [], held: 0 },
      gamma: { state: { kind: 'absent' }, readers: [], knownTo: [], held: 'none' },
    } as const
    const betaKnown = {
      ...world,
      beta: { ...world.beta, readers: ['alice'], knownTo: ['alice'] },
    } as const
    const run = runOf(world)
    const betaRun = runOf(betaKnown)
    const access = createSkillAccess({
      ...run.ports,
      resolution: {
        ...run.ports.resolution,
        resolve: (who, at, _item, options) =>
          betaRun.ports.resolution.resolve(who, at, CAPABILITY.beta, options),
      },
    })
    expect(await access.describe(alice, 'workspace-a', CAPABILITY.alpha)).toStrictEqual(UNKNOWN)
    expect(
      await access.read(alice, 'workspace-a', {
        capability: CAPABILITY.alpha,
        part: { kind: 'body' },
      }),
    ).toStrictEqual(UNKNOWN)
  })
})
