// `export` through the public service: every entry of the pinned snapshot, each checked, or one
// failure without any entry.
import { describe, expect, it } from 'vitest'
import { computeDigest } from '@omne-harness/skill-contract'
import {
  alice,
  createWorld,
  currentBasis,
  currentDigest,
  currentFiles,
  earlierBasis,
  failureOf,
  mallory,
  missing,
  noPackage,
  okOf,
  path,
  review,
  scope,
} from './access-world.ts'

describe('export gives', () => {
  it('every entry of the pinned snapshot, the control files included, each with its bytes', async () => {
    const { access } = createWorld()
    const exported = okOf(await access.export(alice, scope, review, currentBasis))
    expect(exported.basis).toEqual(currentBasis)
    expect(exported.digest).toBe(currentDigest)
    expect(exported.entries.map(entry => entry.path)).toEqual(Object.keys(currentFiles).sort())
    for (const entry of exported.entries) {
      expect(computeDigest(entry.bytes)).toBe(entry.digest)
      expect(entry.bytes.length).toBe(entry.size)
    }
    expect(exported.entries.find(entry => entry.path === 'docs/guide.md')?.mediaType).toBe(
      'text/markdown',
    )
  })
})

describe('export fails as one, without entries', () => {
  it('A12 answers version-changed when one entry moved after the snapshot', async () => {
    const { access, controls } = createWorld()
    controls.tamper(path('docs/guide.md'))
    expect(await access.export(alice, scope, review, currentBasis)).toEqual({
      failure: { kind: 'version-changed' },
    })
  })

  it('answers aborted when the signal is aborted after the snapshot', async () => {
    const { access, controls } = createWorld()
    const signal = controls.abortAfterSnapshot()
    expect(await access.export(alice, scope, review, currentBasis, { signal })).toEqual({
      failure: { kind: 'aborted' },
    })
    expect(controls.opens()).toBe(0)
  })

  it('answers not-available-to-you for a stranger and for a basis of another identity', async () => {
    const { access } = createWorld()
    expect(failureOf(await access.export(mallory, scope, review, currentBasis))).toEqual({
      kind: 'not-available-to-you',
    })
    const other = { ...currentBasis, capability: missing }
    expect(failureOf(await access.export(alice, scope, review, other))).toEqual({
      kind: 'not-available-to-you',
    })
  })

  it('answers basis-unavailable for a basis of material the source no longer holds', async () => {
    const { access } = createWorld()
    expect(failureOf(await access.export(alice, scope, review, earlierBasis))).toEqual({
      kind: 'basis-unavailable',
    })
  })

  it('answers unsupported for an identity without a readable package', async () => {
    const { access } = createWorld()
    const basis = { capability: noPackage, layer: 'workspace' as const, digest: currentDigest }
    expect(failureOf(await access.export(alice, scope, noPackage, basis))).toEqual({
      kind: 'unsupported',
      what: 'no-readable-package',
    })
  })
})
