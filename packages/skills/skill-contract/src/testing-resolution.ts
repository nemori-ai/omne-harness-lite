import assert from 'node:assert/strict'
import type { CapabilityId } from '@omne-harness/assets'
import type { Access } from '@omne-harness/legal-identity'
import { succeed } from '@omne-harness/operation-result'
import { sameCapability } from './capability.ts'
import { digestOfSorted, isPackageDigest } from './digest.ts'
import { isAssetVersion } from './names.ts'
import type { CatalogResolution, Resolution, SkillResolution } from './ports.ts'
import { conformanceCase, handle, type ConformanceCase } from './testing-case.ts'
import type {
  AssetVersion,
  DeclaredProjection,
  PackageDigest,
  SafeReason,
  SkillMaterialBasis,
  SkillName,
  SkillRef,
  SourceLayer,
} from './values.ts'

export type MemoryMaterial = Readonly<{ ref: SkillRef; declared: DeclaredProjection }>

export type MemoryResolutionEntry<P, S> = Readonly<{
  capability: CapabilityId
  visible: (access: Access<P>, scope: S) => boolean
  state:
    | Readonly<{
        kind: 'adopted'
        current: MemoryMaterial
        earlier?: readonly MemoryMaterial[]
      }>
    | Readonly<{
        kind: 'known-unavailable'
        name: SkillName
        description?: string
        reason: SafeReason
      }>
}>

function names(material: MemoryMaterial, basis: SkillMaterialBasis): boolean {
  const { ref } = material
  if (!sameCapability(ref.capability, basis.capability) || ref.layer !== basis.layer) return false
  return basis.assetVersion === undefined || ref.assetVersion === basis.assetVersion
}

function currentAnswer<P, S>(entry: MemoryResolutionEntry<P, S>): CatalogResolution {
  const { state } = entry
  if (state.kind === 'known-unavailable') {
    const { kind, ...facts } = state
    return { kind, capability: entry.capability, ...facts }
  }
  return { kind: 'adopted', ref: state.current.ref, declared: state.current.declared }
}

function answerOf<P, S>(
  entry: MemoryResolutionEntry<P, S>,
  basis: SkillMaterialBasis | undefined,
): Resolution {
  const { state } = entry
  if (basis === undefined || state.kind === 'known-unavailable') return currentAnswer(entry)
  const material = [state.current, ...(state.earlier ?? [])].find(item => names(item, basis))
  if (material === undefined) return { kind: 'basis-not-lawful' }
  return {
    kind: 'adopted',
    ref: { ...material.ref, digest: basis.digest },
    declared: material.declared,
  }
}

export function createMemoryResolution<P, S>(
  entries: readonly MemoryResolutionEntry<P, S>[],
): SkillResolution<P, S> {
  const known = (access: Access<P>, scope: S) =>
    entries.filter(entry => entry.visible(access, scope))
  return {
    async resolve(access, scope, capability, options): Promise<Resolution> {
      const entry = known(access, scope).find(item => sameCapability(item.capability, capability))
      return entry === undefined ? { kind: 'none' } : answerOf(entry, options?.basis)
    },
    async adopted(access, scope) {
      return succeed(known(access, scope).map(currentAnswer))
    },
  }
}

export type PrincipalSample<P, S> = Readonly<{ access: Access<P>; scope: S }>

export type ResolutionFixture<P, S> = Readonly<{
  resolution: SkillResolution<P, S>
  permitted: PrincipalSample<P, S>
  refused: PrincipalSample<P, S>
  adopted: CapabilityId
  missing: CapabilityId
  standIn?: CapabilityId
  earlier?: SkillMaterialBasis
  unlawfulLayer?: SourceLayer
  noPackage?: CapabilityId
}>

export const RESOLUTION_NO_DISCLOSURE =
  'answers a principal without the right the same for an existing and a missing identity'

async function adoptedRef<P, S>(fixture: ResolutionFixture<P, S>): Promise<SkillRef> {
  const { permitted } = fixture
  const answer = await fixture.resolution.resolve(
    permitted.access,
    permitted.scope,
    fixture.adopted,
  )
  if (answer.kind !== 'adopted') assert.fail(`the adopted sample answered ${answer.kind}`)
  return answer.ref
}

function basisOf(ref: SkillRef): SkillMaterialBasis {
  return {
    capability: ref.capability,
    layer: ref.layer,
    ...(ref.assetVersion === undefined ? {} : { assetVersion: ref.assetVersion }),
    digest: ref.digest ?? digestOfSorted([]),
  }
}

function otherVersion(version: AssetVersion): AssetVersion {
  for (const text of ['conformance-unlawful-version', 'conformance-unlawful-version-2'])
    if (isAssetVersion(text) && text !== version) return text
  throw new Error('unreachable: two different texts cannot both equal one version')
}

function otherDigest(digest: PackageDigest): PackageDigest {
  for (const text of [`sha256:${'0'.repeat(64)}`, `sha256:${'1'.repeat(64)}`])
    if (isPackageDigest(text) && text !== digest) return text
  throw new Error('unreachable: two different texts cannot both equal one digest')
}

function capabilityOf(answer: CatalogResolution): CapabilityId {
  return answer.kind === 'adopted' ? answer.ref.capability : answer.capability
}

export function skillResolutionConformance<P, S>(): ConformanceCase<ResolutionFixture<P, S>>[] {
  return [
    conformanceCase(
      'PR1',
      'resolves an adopted identity to its material and declarations',
      async f => {
        const answer = await f.resolution.resolve(f.permitted.access, f.permitted.scope, f.adopted)
        if (answer.kind !== 'adopted') assert.fail(`expected adopted, got ${answer.kind}`)
        assert.ok(
          sameCapability(answer.ref.capability, f.adopted),
          'the ref names another identity',
        )
        assert.equal(answer.declared.name, f.adopted.name)
      },
    ),
    conformanceCase('PR2', 'answers none for an identity that does not exist', async f => {
      assert.deepEqual(
        await f.resolution.resolve(f.permitted.access, f.permitted.scope, f.missing),
        {
          kind: 'none',
        },
      )
    }),
    conformanceCase(
      'PR2',
      'answers none for an identity that does not exist, with a basis too',
      async f => {
        const basis = { ...basisOf(await adoptedRef(f)), capability: f.missing }
        assert.deepEqual(
          await f.resolution.resolve(f.permitted.access, f.permitted.scope, f.missing, { basis }),
          { kind: 'none' },
        )
      },
    ),
    conformanceCase('PR3', 'resolves a basis of the adopted material to that material', async f => {
      const ref = await adoptedRef(f)
      const answer = await f.resolution.resolve(f.permitted.access, f.permitted.scope, f.adopted, {
        basis: basisOf(ref),
      })
      if (answer.kind !== 'adopted') assert.fail(`expected adopted, got ${answer.kind}`)
      assert.ok(sameCapability(answer.ref.capability, f.adopted), 'the ref names another identity')
      assert.equal(answer.ref.layer, ref.layer)
      assert.equal(answer.ref.assetVersion, ref.assetVersion)
    }),
    conformanceCase('PR3', 'gives back the digest of the basis without comparing it', async f => {
      const ref = await adoptedRef(f)
      const digest = otherDigest(handle(ref.digest, 'digest of the adopted material'))
      const answer = await f.resolution.resolve(f.permitted.access, f.permitted.scope, f.adopted, {
        basis: { ...basisOf(ref), digest },
      })
      if (answer.kind !== 'adopted') assert.fail(`expected adopted, got ${answer.kind}`)
      assert.equal(answer.ref.digest, digest, 'the ref does not carry the digest of the basis')
    }),
    conformanceCase(
      'PR3',
      'gives back the digest of the basis for material without a readable package',
      async f => {
        const identity = handle(f.noPackage, 'noPackage')
        const plain = await f.resolution.resolve(f.permitted.access, f.permitted.scope, identity)
        if (plain.kind !== 'adopted') assert.fail(`the noPackage sample answered ${plain.kind}`)
        assert.equal(plain.ref.digest, undefined, 'the noPackage sample has a readable package')
        const basis = basisOf(plain.ref)
        const answer = await f.resolution.resolve(f.permitted.access, f.permitted.scope, identity, {
          basis,
        })
        if (answer.kind !== 'adopted') assert.fail(`expected adopted, got ${answer.kind}`)
        assert.equal(
          answer.ref.digest,
          basis.digest,
          'the ref does not carry the digest of the basis',
        )
      },
    ),
    conformanceCase(
      'PR3',
      'resolves a basis of an earlier lawful version to the earlier material',
      async f => {
        const earlier = handle(f.earlier, 'earlier')
        const answer = await f.resolution.resolve(
          f.permitted.access,
          f.permitted.scope,
          f.adopted,
          {
            basis: earlier,
          },
        )
        if (answer.kind !== 'adopted') assert.fail(`expected adopted, got ${answer.kind}`)
        assert.equal(answer.ref.layer, earlier.layer)
        assert.equal(answer.ref.assetVersion, earlier.assetVersion)
        assert.equal(
          answer.ref.digest,
          earlier.digest,
          'the ref does not point at the earlier material',
        )
      },
    ),
    conformanceCase(
      'PR4',
      'answers basis-not-lawful for a basis without asset version from a layer that is not lawful',
      async f => {
        const layer = handle(f.unlawfulLayer, 'unlawfulLayer')
        const { assetVersion: _dropped, ...basis } = basisOf(await adoptedRef(f))
        const answer = await f.resolution.resolve(
          f.permitted.access,
          f.permitted.scope,
          f.adopted,
          {
            basis: { ...basis, layer },
          },
        )
        assert.deepEqual(answer, { kind: 'basis-not-lawful' })
      },
    ),
    conformanceCase(
      'PR4',
      'answers basis-not-lawful for a basis whose asset version is not lawful',
      async f => {
        const ref = await adoptedRef(f)
        const version = handle(ref.assetVersion, 'asset version of the adopted material')
        const answer = await f.resolution.resolve(
          f.permitted.access,
          f.permitted.scope,
          f.adopted,
          {
            basis: { ...basisOf(ref), assetVersion: otherVersion(version) },
          },
        )
        assert.deepEqual(answer, { kind: 'basis-not-lawful' })
      },
    ),
    conformanceCase('PR5', RESOLUTION_NO_DISCLOSURE, async f => {
      const basis = basisOf(await adoptedRef(f))
      const ask = (capability: CapabilityId, options?: Readonly<{ basis: SkillMaterialBasis }>) =>
        f.resolution.resolve(f.refused.access, f.refused.scope, capability, options)
      assert.deepEqual(await ask(f.adopted), await ask(f.missing))
      assert.deepEqual(
        await ask(f.adopted, { basis }),
        await ask(f.missing, { basis: { ...basis, capability: f.missing } }),
      )
      if (f.standIn !== undefined) assert.deepEqual(await ask(f.standIn), await ask(f.missing))
      const listed = await f.resolution.adopted(f.refused.access, f.refused.scope)
      if (!('ok' in listed)) assert.fail('the lawful set of the refused principal answered unknown')
      const hidden = [f.adopted, ...(f.standIn === undefined ? [] : [f.standIn])]
      for (const answer of listed.ok)
        assert.ok(
          !hidden.some(item => sameCapability(item, capabilityOf(answer))),
          'the lawful set of the refused principal lists a hidden identity',
        )
    }),
    conformanceCase(
      'PR6',
      'lists the current lawful set with adopted and known-unavailable answers only',
      async f => {
        const listed = await f.resolution.adopted(f.permitted.access, f.permitted.scope)
        if (!('ok' in listed)) assert.fail('the lawful set answered unknown')
        for (const answer of listed.ok)
          assert.ok(['adopted', 'known-unavailable'].includes(answer.kind), answer.kind)
        const capabilities = listed.ok.map(capabilityOf)
        assert.ok(
          capabilities.some(item => sameCapability(item, f.adopted)),
          'adopted is missing',
        )
        const keys = capabilities.map(item => `${item.category}\0${item.name}`)
        assert.equal(new Set(keys).size, keys.length, 'an identity is listed twice')
      },
    ),
    conformanceCase('PR7', 'answers known-unavailable before it looks at a basis', async f => {
      const standIn = handle(f.standIn, 'standIn')
      const basis = { ...basisOf(await adoptedRef(f)), capability: standIn }
      const plain = await f.resolution.resolve(f.permitted.access, f.permitted.scope, standIn)
      const withBasis = await f.resolution.resolve(f.permitted.access, f.permitted.scope, standIn, {
        basis,
      })
      if (plain.kind !== 'known-unavailable')
        assert.fail(`expected known-unavailable, got ${plain.kind}`)
      assert.ok(sameCapability(plain.capability, standIn))
      assert.deepEqual(withBasis, plain)
    }),
  ]
}
