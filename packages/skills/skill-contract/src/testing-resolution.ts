// The conformance suite of `SkillResolution` and its memory double.
import type { CapabilityId } from '@omne-harness/assets'
import type { Access } from '@omne-harness/legal-identity'
import { succeed } from '@omne-harness/operation-result'
import { describe, expect, it } from 'vitest'
import { toPackageDigest } from './digest.ts'
import type { CatalogResolution, Resolution, SkillResolution } from './ports.ts'
import type {
  DeclaredProjection,
  SafeReason,
  SkillMaterialBasis,
  SkillName,
  SkillRef,
} from './values.ts'

export type MemoryMaterial = Readonly<{ ref: SkillRef; declared: DeclaredProjection }>

export type MemoryResolutionEntry<P, S> = Readonly<{
  capability: CapabilityId
  /** Whether the principal may know this identity in the scope. */
  visible: (access: Access<P>, scope: S) => boolean
  state:
    | Readonly<{
        kind: 'adopted'
        current: MemoryMaterial
        /** Earlier versions that a basis may still name. */
        earlier?: readonly MemoryMaterial[]
      }>
    | Readonly<{
        kind: 'known-unavailable'
        name: SkillName
        description?: string
        reason: SafeReason
      }>
}>

export function sameCapability(left: CapabilityId, right: CapabilityId): boolean {
  return left.category === right.category && left.name === right.name
}

function names(material: MemoryMaterial, basis: SkillMaterialBasis): boolean {
  const { ref } = material
  return (
    sameCapability(ref.capability, basis.capability) &&
    ref.layer === basis.layer &&
    ref.digest === basis.digest &&
    (basis.assetVersion === undefined || ref.assetVersion === basis.assetVersion)
  )
}

function answerOf<P, S>(
  entry: MemoryResolutionEntry<P, S>,
  basis: SkillMaterialBasis | undefined,
): CatalogResolution | Readonly<{ kind: 'basis-not-lawful' }> {
  const { state } = entry
  if (state.kind === 'known-unavailable') {
    const { kind, ...facts } = state
    return { kind, capability: entry.capability, ...facts }
  }
  const material =
    basis === undefined
      ? state.current
      : [state.current, ...(state.earlier ?? [])].find(item => names(item, basis))
  if (material === undefined) return { kind: 'basis-not-lawful' }
  return { kind: 'adopted', ref: material.ref, declared: material.declared }
}

/**
 * A resolution over fixed identities in memory. An identity that the principal may not know
 * answers `none`, the same as an identity that does not exist.
 */
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
      return succeed(
        known(access, scope).map(entry => {
          const answer = answerOf(entry, undefined)
          if (answer.kind === 'basis-not-lawful') throw new Error('a current answer has no basis')
          return answer
        }),
      )
    },
  }
}

export type PrincipalSample<P, S> = Readonly<{ access: Access<P>; scope: S }>

export type ResolutionSamples<P, S> = Readonly<{
  /** A principal who may read `adopted` in the scope. */
  permitted: PrincipalSample<P, S>
  /** A principal who has no right to `adopted` or `standIn`. */
  refused: PrincipalSample<P, S>
  /** An identity adopted for `permitted`, with a package digest. */
  adopted: CapabilityId
  /** An identity that exists for nobody. */
  missing: CapabilityId
  /** An identity that `permitted` knows lawfully and that is not available now, when there is one. */
  standIn?: CapabilityId
}>

const RESOLUTION_NO_DISCLOSURE =
  'answers a principal without the right the same for an existing and a missing identity'

const OTHER_DIGEST = `sha256:${'0'.repeat(64)}`

/** Names `missing` with the same layer, version and digest as `basis`. */
function rename(basis: SkillMaterialBasis, capability: CapabilityId): SkillMaterialBasis {
  return { ...basis, capability }
}

function basisOf(ref: SkillRef): SkillMaterialBasis {
  if (ref.digest === undefined) throw new Error('the adopted sample has no package digest')
  return {
    capability: ref.capability,
    layer: ref.layer,
    ...(ref.assetVersion === undefined ? {} : { assetVersion: ref.assetVersion }),
    digest: ref.digest,
  }
}

export function describeSkillResolutionConformance<P, S>(
  input: Readonly<{
    name: string
    create: () => SkillResolution<P, S> | Promise<SkillResolution<P, S>>
    samples: ResolutionSamples<P, S>
  }>,
): void {
  const { create, samples } = input
  const { permitted, refused } = samples
  const adoptedRef = async (resolution: SkillResolution<P, S>) => {
    const answer = await resolution.resolve(permitted.access, permitted.scope, samples.adopted)
    if (answer.kind !== 'adopted') throw new Error(`the adopted sample answered ${answer.kind}`)
    return answer.ref
  }

  describe(`SkillResolution conformance: ${input.name}`, () => {
    it('resolves an adopted identity to its material and declarations', async () => {
      const resolution = await create()
      const answer = await resolution.resolve(permitted.access, permitted.scope, samples.adopted)
      expect(answer.kind).toBe('adopted')
      if (answer.kind !== 'adopted') return
      expect(sameCapability(answer.ref.capability, samples.adopted)).toBe(true)
      expect(answer.declared.name).toBe(samples.adopted.name)
      expect(answer.ref.digest).toBeDefined()
    })

    it('answers none for an identity that does not exist', async () => {
      const resolution = await create()
      expect(await resolution.resolve(permitted.access, permitted.scope, samples.missing)).toEqual({
        kind: 'none',
      })
    })

    it('resolves a basis of the adopted material to that material', async () => {
      const resolution = await create()
      const basis = basisOf(await adoptedRef(resolution))
      const answer = await resolution.resolve(permitted.access, permitted.scope, samples.adopted, {
        basis,
      })
      expect(answer).toMatchObject({
        kind: 'adopted',
        ref: { digest: basis.digest, layer: basis.layer },
      })
    })

    it('answers basis-not-lawful for a basis whose version is not lawful', async () => {
      const resolution = await create()
      const basis = basisOf(await adoptedRef(resolution))
      const other = toPackageDigest(OTHER_DIGEST)
      if (!('ok' in other) || other.ok === basis.digest) throw new Error('no other digest')
      const answer = await resolution.resolve(permitted.access, permitted.scope, samples.adopted, {
        basis: { ...basis, digest: other.ok },
      })
      expect(answer).toEqual({ kind: 'basis-not-lawful' })
    })

    it(RESOLUTION_NO_DISCLOSURE, async () => {
      const resolution = await create()
      const basis = basisOf(await adoptedRef(resolution))
      const ask = (capability: CapabilityId, options?: Readonly<{ basis: SkillMaterialBasis }>) =>
        resolution.resolve(refused.access, refused.scope, capability, options)
      expect(await ask(samples.missing)).toEqual(await ask(samples.adopted))
      expect(await ask(samples.missing, { basis: rename(basis, samples.missing) })).toEqual(
        await ask(samples.adopted, { basis }),
      )
      if (samples.standIn !== undefined)
        expect(await ask(samples.missing)).toEqual(await ask(samples.standIn))
      const listed = await resolution.adopted(refused.access, refused.scope)
      expect(listed).toHaveProperty('ok')
      if (!('ok' in listed)) return
      const hidden = [samples.adopted, ...(samples.standIn === undefined ? [] : [samples.standIn])]
      for (const answer of listed.ok) {
        const capability = answer.kind === 'adopted' ? answer.ref.capability : answer.capability
        expect(hidden.some(item => sameCapability(item, capability))).toBe(false)
      }
    })

    it('lists the current lawful set with adopted and known-unavailable answers only', async () => {
      const resolution = await create()
      const listed = await resolution.adopted(permitted.access, permitted.scope)
      if (!('ok' in listed)) throw new Error('the lawful set answered unknown')
      const capabilities = listed.ok.map(answer =>
        answer.kind === 'adopted' ? answer.ref.capability : answer.capability,
      )
      for (const answer of listed.ok)
        expect(['adopted', 'known-unavailable']).toContain(answer.kind)
      expect(capabilities.some(item => sameCapability(item, samples.adopted))).toBe(true)
      const keys = capabilities.map(item => `${item.category}\0${item.name}`)
      expect(new Set(keys).size).toBe(keys.length)
    })

    it.runIf(samples.standIn !== undefined)(
      'answers known-unavailable before it looks at a basis',
      async () => {
        const standIn = samples.standIn
        if (standIn === undefined) return
        const resolution = await create()
        const basis = rename(basisOf(await adoptedRef(resolution)), standIn)
        const plain = await resolution.resolve(permitted.access, permitted.scope, standIn)
        const withBasis = await resolution.resolve(permitted.access, permitted.scope, standIn, {
          basis,
        })
        expect(plain).toMatchObject({ kind: 'known-unavailable', capability: standIn })
        expect(withBasis).toEqual(plain)
      },
    )
  })
}
