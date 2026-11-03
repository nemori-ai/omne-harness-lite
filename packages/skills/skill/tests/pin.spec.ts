// Steps 5 and 7 through `pin` directly: the digest to pin, the snapshot and its digest, the
// source failures of the snapshot, and the abort checks around the port call.
import { describe, expect, it } from 'vitest'
import type { PinFailure } from '@omne-harness/skill-contract'
import type { SkillPackageSource, SourceFailure } from '@omne-harness/skill-contract/provider'
import { gate } from '../src/access/gate.ts'
import { pin } from '../src/access/pin.ts'
import {
  alice,
  createWorld,
  currentBasis,
  currentDigest,
  earlierBasis,
  fail,
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

describe('step 5: the digest to pin', () => {
  it('step-05-unsupported answers no-readable-package when the reference has no digest', async () => {
    const world = createWorld()
    const noDigest = okOf(await gate(world.ports, alice, scope, noPackage))
    expect(failureOf(await pin(world.ports, noDigest))).toEqual({
      kind: 'unsupported',
      what: 'no-readable-package',
    })
  })

  it('step-05-pins the digest of the reference without a basis', async () => {
    const world = createWorld()
    const pinned = okOf(await pin(world.ports, await gated(world)))
    expect(pinned.digest).toBe(currentDigest)
    expect(pinned.snapshot.digest).toBe(currentDigest)
    expect(pinned.locator).toEqual({ kind: 'directory', root: '/skills/review' })
  })

  it('step-05-pins the digest of the basis with a basis', async () => {
    const world = createWorld()
    const pinned = okOf(await pin(world.ports, await gated(world, currentBasis)))
    expect(pinned.digest).toBe(currentBasis.digest)
    expect(pinned.gated.basis).toEqual(currentBasis)
  })
})

describe('step 7: the snapshot digest', () => {
  it('step-07-basis-unavailable when the snapshot digest differs from the basis digest', async () => {
    const world = createWorld()
    expect(failureOf(await pin(world.ports, await gated(world, earlierBasis)))).toEqual({
      kind: 'basis-unavailable',
    })
  })

  it('step-07-adopted-material-changed when the source moved under the resolution', async () => {
    const world = createWorld()
    const material = await gated(world)
    world.controls.replaceAdopted()
    expect(failureOf(await pin(world.ports, material))).toEqual({
      kind: 'adopted-material-changed',
    })
  })

  it('step-07-basis-unavailable when the source moved and the basis names the old material', async () => {
    const world = createWorld()
    const material = await gated(world, currentBasis)
    world.controls.replaceAdopted()
    expect(failureOf(await pin(world.ports, material))).toEqual({ kind: 'basis-unavailable' })
  })
})

describe('step 7: source failures of the snapshot', () => {
  const MAPPED: readonly (readonly [SourceFailure, PinFailure, PinFailure])[] = [
    ['package-not-found', { kind: 'source-unavailable' }, { kind: 'basis-unavailable' }],
    ['unavailable', { kind: 'source-unavailable' }, { kind: 'source-unavailable' }],
    ['entry-unreadable', { kind: 'source-unavailable' }, { kind: 'source-unavailable' }],
    ['outside-package', { kind: 'outside-package' }, { kind: 'outside-package' }],
    // A snapshot that answers about one entry breaks the port contract: the source is unusable.
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
      const ports = { ...world.ports, source: failing }
      expect(failureOf(await pin(ports, await gated(world)))).toEqual(plain)
      expect(failureOf(await pin(ports, await gated(world, currentBasis)))).toEqual(withBasis)
    },
  )
})

describe('the abort checks around the snapshot', () => {
  it('answers aborted before the snapshot when the signal is already aborted', async () => {
    const world = createWorld()
    let snapshots = 0
    const counting: SkillPackageSource = {
      snapshot: async locator => {
        snapshots += 1
        return world.ports.source.snapshot(locator)
      },
      open: world.ports.source.open,
    }
    const signal = AbortSignal.abort()
    const material = await gated(world)
    expect(failureOf(await pin({ ...world.ports, source: counting }, material, signal))).toEqual({
      kind: 'aborted',
    })
    expect(snapshots).toBe(0)
  })

  it('answers aborted after the snapshot when the signal was aborted meanwhile', async () => {
    const world = createWorld()
    const material = await gated(world)
    const signal = world.controls.abortAfterSnapshot()
    expect(failureOf(await pin(world.ports, material, signal))).toEqual({ kind: 'aborted' })
  })
})
