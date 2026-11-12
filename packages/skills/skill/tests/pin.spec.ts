// Steps 5 and 7 through `materialOf` and `pin` directly: the material to pin, the snapshot and
// its digest, the source failures of the snapshot, and the abort checks around the port call.
import { describe, expect, it } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import type { PinFailure } from '@omne-harness/skill-contract'
import type { SkillPackageSource, SourceFailure } from '@omne-harness/skill-contract/provider'
import { gate } from '../src/access/gate.ts'
import { ADOPTED_MATERIAL_CHANGED, BASIS_UNAVAILABLE, materialOf, pin } from '../src/access/pin.ts'
import {
  alice,
  createWorld,
  currentBasis,
  currentDigest,
  earlierBasis,
  failureOf,
  noPackage,
  okOf,
  review,
  scope,
  type World,
} from './access-world.ts'

async function gated(world: World, basis?: typeof currentBasis) {
  return okOf(await gate(world.ports, alice, scope, review, basis))
}

/** Pins like `read` and `list` do: the moved failure follows whether there is a basis. */
async function pinned(world: World, basis?: typeof currentBasis, signal?: AbortSignal) {
  const material = await gated(world, basis)
  const moved = basis === undefined ? ADOPTED_MATERIAL_CHANGED : BASIS_UNAVAILABLE
  return pin(world.ports, material, okOf(materialOf(material)), moved, signal)
}

describe('step 5: the material to pin', () => {
  it('step-05-unsupported answers no-readable-package when the reference has no digest', async () => {
    const world = createWorld()
    const noDigest = okOf(await gate(world.ports, alice, scope, noPackage))
    expect(failureOf(materialOf(noDigest))).toStrictEqual({
      kind: 'unsupported',
      what: 'no-readable-package',
    })
  })

  it('step-05-pins the material of the reference without a basis', async () => {
    const world = createWorld()
    expect(okOf(materialOf(await gated(world)))).toStrictEqual(currentBasis)
  })

  it('step-05-pins the basis itself with a basis, not the asset version of the reference', async () => {
    // A basis without an asset version names the material by its layer; the reference that the
    // resolution gives carries the asset version v2. The pinned material is the basis as given.
    const world = createWorld()
    const { assetVersion: _dropped, ...byLayer } = currentBasis
    const material = await gated(world, byLayer)
    expect(material.ref.assetVersion).toBe('v2')
    expect(okOf(materialOf(material))).toStrictEqual(byLayer)
  })
})

describe('step 7: the snapshot digest', () => {
  it('step-07-pinned gives the snapshot, the locator and the material', async () => {
    const world = createWorld()
    const result = okOf(await pinned(world))
    expect(result.snapshot.digest).toBe(currentDigest)
    expect(result.locator).toStrictEqual({ kind: 'directory', root: '/skills/review' })
    expect(result.basis).toStrictEqual(currentBasis)
    expect(result.byBasis).toBe(false)
    expect(okOf(await pinned(world, currentBasis)).byBasis).toBe(true)
  })

  it('step-07-basis-unavailable when the snapshot digest differs from the basis digest', async () => {
    const world = createWorld()
    expect(failureOf(await pinned(world, earlierBasis))).toStrictEqual({
      kind: 'basis-unavailable',
    })
  })

  it('step-07-adopted-material-changed when the source moved under the resolution', async () => {
    const world = createWorld()
    const material = await gated(world)
    world.controls.replaceAdopted()
    expect(
      failureOf(
        await pin(world.ports, material, okOf(materialOf(material)), ADOPTED_MATERIAL_CHANGED),
      ),
    ).toStrictEqual({ kind: 'adopted-material-changed' })
  })

  it('step-07-gives back the moved failure that the caller chose', async () => {
    const world = createWorld()
    const material = await gated(world, currentBasis)
    world.controls.replaceAdopted()
    expect(
      failureOf(await pin(world.ports, material, okOf(materialOf(material)), BASIS_UNAVAILABLE)),
    ).toStrictEqual({ kind: 'basis-unavailable' })
  })
})

describe('step 7: source failures of the snapshot', () => {
  const MAPPED: readonly (readonly [SourceFailure, PinFailure, PinFailure])[] = [
    ['package-not-found', { kind: 'source-unavailable' }, { kind: 'basis-unavailable' }],
    ['unavailable', { kind: 'source-unavailable' }, { kind: 'source-unavailable' }],
    ['entry-unreadable', { kind: 'source-unavailable' }, { kind: 'source-unavailable' }],
    ['outside-package', { kind: 'outside-package' }, { kind: 'outside-package' }],
    ['entry-not-found', { kind: 'source-unavailable' }, { kind: 'source-unavailable' }],
    ['bytes-mismatch', { kind: 'source-unavailable' }, { kind: 'source-unavailable' }],
  ]

  it.each(MAPPED)(
    'step-07-source-%s maps to %j without and %j with a basis',
    async (failure, plain, withBasis) => {
      const world = createWorld()
      const failing: SkillPackageSource = {
        snapshot: async () => fail(failure),
        open: world.ports.source.open,
      }
      const broken: World = { ...world, ports: { ...world.ports, source: failing } }
      expect(failureOf(await pinned(broken))).toStrictEqual(plain)
      expect(failureOf(await pinned(broken, currentBasis))).toStrictEqual(withBasis)
    },
  )
})

describe('the abort checks around the snapshot', () => {
  it('answers aborted before the snapshot when the signal is already aborted', async () => {
    const world = createWorld()
    expect(failureOf(await pinned(world, undefined, AbortSignal.abort()))).toStrictEqual({
      kind: 'aborted',
    })
    expect(world.controls.calls().snapshot).toBe(0)
  })

  it('answers aborted after the snapshot when the signal was aborted meanwhile', async () => {
    const world = createWorld()
    const signal = world.controls.abortAfterSnapshot()
    expect(failureOf(await pinned(world, undefined, signal))).toStrictEqual({ kind: 'aborted' })
    expect(world.controls.calls().snapshot).toBe(1)
  })
})
