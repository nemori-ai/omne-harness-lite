// Steps 9 and 10 through `verifiedBytes` directly: the entry lookup, the bytes from the source,
// the digest check, the source failures of `open`, and the abort checks around the port call.
import { describe, expect, it } from 'vitest'
import { computeDigest, type ReadFailure } from '@omne-harness/skill-contract'
import type { SkillPackageSource, SourceFailure } from '@omne-harness/skill-contract/provider'
import { verifiedBytes } from '../src/access/bytes.ts'
import { gate } from '../src/access/gate.ts'
import { pin } from '../src/access/pin.ts'
import {
  alice,
  bytesOf,
  createWorld,
  currentBasis,
  fail,
  failureOf,
  GUIDE,
  okOf,
  path,
  review,
  scope,
  type World,
} from './access-world.ts'

async function pinned(world: World, basis?: typeof currentBasis) {
  const gated = okOf(await gate(world.ports, alice, scope, review, basis))
  return okOf(await pin(world.ports, gated))
}

const guide = path('docs/guide.md')

describe('step 9: the entry', () => {
  it('step-09-resource-missing when the snapshot has no such path', async () => {
    const world = createWorld()
    const answer = await verifiedBytes(world.ports, await pinned(world), path('docs/none.md'))
    expect(failureOf(answer)).toEqual({ kind: 'resource-missing' })
    expect(world.controls.opens()).toBe(0)
  })
})

describe('step 10: the bytes', () => {
  it('step-10-verified gives the entry and the bytes whose digest the snapshot lists', async () => {
    const world = createWorld()
    const { entry, bytes } = okOf(await verifiedBytes(world.ports, await pinned(world), guide))
    expect(entry.path).toBe('docs/guide.md')
    expect(bytes).toEqual(bytesOf(GUIDE))
    expect(computeDigest(bytes)).toBe(entry.digest)
  })

  it('step-10-version-changed when the bytes are off the entry digest, without the bytes', async () => {
    const world = createWorld()
    const material = await pinned(world)
    world.controls.tamper(guide)
    const answer = await verifiedBytes(world.ports, material, guide)
    expect(answer).toEqual({ failure: { kind: 'version-changed' } })
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
      expect(failureOf(await verifiedBytes(ports, await pinned(world), guide))).toEqual(plain)
      expect(
        failureOf(await verifiedBytes(ports, await pinned(world, currentBasis), guide)),
      ).toEqual(withBasis)
    },
  )
})

describe('the abort checks around open', () => {
  it('answers aborted before open when the signal is already aborted', async () => {
    const world = createWorld()
    const material = await pinned(world)
    const answer = await verifiedBytes(world.ports, material, guide, AbortSignal.abort())
    expect(failureOf(answer)).toEqual({ kind: 'aborted' })
    expect(world.controls.opens()).toBe(0)
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
      guide,
      aborter.signal,
    )
    expect(answer).toEqual({ failure: { kind: 'aborted' } })
  })
})
