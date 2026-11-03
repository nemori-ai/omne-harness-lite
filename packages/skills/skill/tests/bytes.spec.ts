// Step 10 through `verifiedBytes` directly: the bytes from the source for one entry, the digest
// check, the source failures of `open`, and the abort checks around the port call.
import { describe, expect, it } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import { computeDigest, type PackageEntry, type ReadFailure } from '@omne-harness/skill-contract'
import type { SkillPackageSource, SourceFailure } from '@omne-harness/skill-contract/provider'
import { verifiedBytes } from '../src/access/bytes.ts'
import { gate } from '../src/access/gate.ts'
import { ADOPTED_MATERIAL_CHANGED, BASIS_UNAVAILABLE, materialOf, pin } from '../src/access/pin.ts'
import {
  alice,
  bytesOf,
  createWorld,
  currentBasis,
  failureOf,
  GUIDE,
  okOf,
  review,
  scope,
  type World,
} from './access-world.ts'

async function pinned(world: World, basis?: typeof currentBasis) {
  const gated = okOf(await gate(world.ports, alice, scope, review, basis))
  const moved = basis === undefined ? ADOPTED_MATERIAL_CHANGED : BASIS_UNAVAILABLE
  return okOf(await pin(world.ports, gated, okOf(materialOf(gated)), moved))
}

function guideOf(material: Awaited<ReturnType<typeof pinned>>): PackageEntry {
  const entry = material.snapshot.entries.find(item => item.path === 'docs/guide.md')
  if (entry === undefined) throw new Error('the world has no docs/guide.md')
  return entry
}

describe('step 10: the bytes', () => {
  it('step-10-verified gives the bytes whose digest the entry lists, through open with the pinned digest', async () => {
    const world = createWorld()
    const material = await pinned(world)
    const entry = guideOf(material)
    const bytes = okOf(await verifiedBytes(world.ports, material, entry))
    expect(bytes).toStrictEqual(bytesOf(GUIDE))
    expect(computeDigest(bytes)).toBe(entry.digest)
    expect(world.controls.calls().open).toBe(1)
  })

  it('step-10-version-changed when the bytes are off the entry digest, without the bytes', async () => {
    const world = createWorld()
    const material = await pinned(world)
    const entry = guideOf(material)
    world.controls.tamper(entry.path)
    expect(await verifiedBytes(world.ports, material, entry)).toStrictEqual({
      failure: { kind: 'version-changed' },
    })
  })

  const MAPPED: readonly (readonly [SourceFailure, ReadFailure, ReadFailure])[] = [
    ['entry-not-found', { kind: 'resource-missing' }, { kind: 'resource-missing' }],
    ['unavailable', { kind: 'source-unavailable' }, { kind: 'source-unavailable' }],
    ['outside-package', { kind: 'outside-package' }, { kind: 'outside-package' }],
    ['bytes-mismatch', { kind: 'version-changed' }, { kind: 'version-changed' }],
    ['package-not-found', { kind: 'source-unavailable' }, { kind: 'basis-unavailable' }],
    ['entry-unreadable', { kind: 'source-unavailable' }, { kind: 'source-unavailable' }],
  ]

  it.each(MAPPED)(
    'step-10-source-%s maps to %j without and %j with a basis',
    async (failure, plain, withBasis) => {
      const world = createWorld()
      const failing: SkillPackageSource = {
        snapshot: world.ports.source.snapshot,
        open: async () => fail(failure),
      }
      const ports = { ...world.ports, source: failing }
      const adopted = await pinned(world)
      expect(failureOf(await verifiedBytes(ports, adopted, guideOf(adopted)))).toStrictEqual(plain)
      const named = await pinned(world, currentBasis)
      expect(failureOf(await verifiedBytes(ports, named, guideOf(named)))).toStrictEqual(withBasis)
    },
  )
})

describe('the abort checks around open', () => {
  it('answers aborted before open when the signal is already aborted', async () => {
    const world = createWorld()
    const material = await pinned(world)
    const answer = await verifiedBytes(
      world.ports,
      material,
      guideOf(material),
      AbortSignal.abort(),
    )
    expect(failureOf(answer)).toStrictEqual({ kind: 'aborted' })
    expect(world.controls.calls().open).toBe(0)
  })

  it('answers aborted after open when the signal was aborted meanwhile, without the bytes', async () => {
    const world = createWorld()
    const material = await pinned(world)
    const aborter = new AbortController()
    const aborting: SkillPackageSource = {
      snapshot: world.ports.source.snapshot,
      open: async (locator, digest, entryPath) => {
        const answer = await world.ports.source.open(locator, digest, entryPath)
        aborter.abort()
        return answer
      },
    }
    const answer = await verifiedBytes(
      { ...world.ports, source: aborting },
      material,
      guideOf(material),
      aborter.signal,
    )
    expect(answer).toStrictEqual({ failure: { kind: 'aborted' } })
  })
})
