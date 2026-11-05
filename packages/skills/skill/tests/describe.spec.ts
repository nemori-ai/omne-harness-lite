// `describe` through the public service: the two material states, the basis of a described
// material, and that `describe` reads no bytes. The non-disclosure paths are checked by the
// conformance suite in `conformance.spec.ts` on two worlds.
import { describe, expect, it } from 'vitest'
import { isPackageDigest } from '@omne-harness/skill-contract'
import {
  alice,
  createWorld,
  currentBasis,
  currentDigest,
  earlierBasis,
  granted,
  mallory,
  noPackage,
  okOf,
  review,
  scope,
  workspaceNote,
} from './access-world.ts'

describe('the description', () => {
  it('pins the adopted material and gives the declared projection', async () => {
    const { access } = createWorld()
    const description = okOf(await access.describe(alice, scope, review))
    expect(description).toStrictEqual({
      capability: review,
      layer: 'tenant',
      material: { kind: 'pinned', basis: currentBasis },
      dependencies: [{ category: 'tool', name: 'read-file' }],
      scripts: [],
      settings: [{ name: 'tone', category: 'preference' }],
      addressing: 'package-relative-path',
    })
  })

  it('describes the material that a basis names, with the basis itself', async () => {
    const { access } = createWorld()
    const description = okOf(await access.describe(alice, scope, review, { basis: earlierBasis }))
    expect(description.material).toStrictEqual({ kind: 'pinned', basis: earlierBasis })
  })

  it('gives back the basis whose digest the source no longer holds: describe reads no bytes', async () => {
    const { access } = createWorld()
    const other = granted(isPackageDigest, `sha256:${'e'.repeat(64)}`)
    const basis = { ...currentBasis, digest: other }
    const description = okOf(await access.describe(alice, scope, review, { basis }))
    expect(description.material).toStrictEqual({ kind: 'pinned', basis })
  })

  it('pins a workspace material without an asset version key', async () => {
    const { access } = createWorld()
    const description = okOf(await access.describe(alice, scope, workspaceNote))
    expect(description.material).toStrictEqual({
      kind: 'pinned',
      basis: { capability: workspaceNote, layer: 'workspace', digest: currentDigest },
    })
  })

  it('states no-readable-package when the reference has no digest', async () => {
    const { access } = createWorld()
    const description = okOf(await access.describe(alice, scope, noPackage))
    expect(description.material).toStrictEqual({ kind: 'no-readable-package' })
    expect(description.layer).toBe('workspace')
  })
})

describe('describe reads no bytes', () => {
  it('succeeds when the source throws at open, and takes no snapshot either', async () => {
    const { access, controls } = createWorld()
    controls.breakOpen()
    const description = okOf(await access.describe(alice, scope, review))
    expect(description.material.kind).toBe('pinned')
    expect(controls.calls()).toStrictEqual({ check: 1, resolve: 1, snapshot: 0, open: 0 })
  })

  it('refuses a stranger before any source call', async () => {
    const { access, controls } = createWorld()
    expect(await access.describe(mallory, scope, review)).toStrictEqual({
      failure: { kind: 'not-available-to-you' },
    })
    expect(controls.calls()).toStrictEqual({ check: 1, resolve: 0, snapshot: 0, open: 0 })
  })
})
