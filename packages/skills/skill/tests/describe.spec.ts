// `describe` through the public service: the two material states, the basis of a described
// material, the three non-disclosure paths, and that `describe` reads no bytes.
import assert from 'node:assert/strict'
import { describe, expect, it } from 'vitest'
import {
  alice,
  checkedOnly,
  createWorld,
  currentBasis,
  earlierBasis,
  failureOf,
  mallory,
  missing,
  noPackage,
  okOf,
  review,
  scope,
} from './access-world.ts'

describe('the description', () => {
  it('pins the adopted material and gives the declared projection', async () => {
    const { access } = createWorld()
    const description = okOf(await access.describe(alice, scope, review))
    expect(description).toEqual({
      capability: review,
      layer: 'tenant',
      material: { kind: 'pinned', basis: currentBasis },
      dependencies: [{ category: 'tool', name: 'read-file' }],
      scripts: [],
      settings: [{ name: 'tone', category: 'preference' }],
      addressing: 'package-relative-path',
    })
  })

  it('describes the material that a basis names', async () => {
    const { access } = createWorld()
    const description = okOf(await access.describe(alice, scope, review, { basis: earlierBasis }))
    expect(description.material).toEqual({ kind: 'pinned', basis: earlierBasis })
  })

  it('states no-readable-package when the reference has no digest', async () => {
    const { access } = createWorld()
    const description = okOf(await access.describe(alice, scope, noPackage))
    expect(description.material).toEqual({ kind: 'no-readable-package' })
    expect(description.layer).toBe('workspace')
  })
})

describe('no disclosure', () => {
  it('A1 answers a stranger the same for an adopted and a missing identity', async () => {
    const { access } = createWorld()
    const existing = await access.describe(mallory, scope, review)
    const absent = await access.describe(mallory, scope, missing)
    assert.deepStrictEqual(existing, absent)
    assert.deepStrictEqual(existing, { failure: { kind: 'not-available-to-you' } })
  })

  it('A2 answers a basis of another identity the same as a refused read', async () => {
    const { access } = createWorld()
    const badBasis = await access.describe(alice, scope, review, {
      basis: { ...currentBasis, capability: missing },
    })
    const refused = await access.describe(mallory, scope, review)
    assert.deepStrictEqual(badBasis, refused)
  })

  it('A3 answers an identity that the resolution does not know the same as a refused read', async () => {
    const { access } = createWorld()
    const none = await access.describe(alice, scope, checkedOnly)
    const refused = await access.describe(mallory, scope, review)
    assert.deepStrictEqual(none, refused)
  })
})

describe('describe reads no bytes', () => {
  it('A13 succeeds when the source throws at open', async () => {
    const { access, controls } = createWorld()
    controls.breakOpen()
    const description = okOf(await access.describe(alice, scope, review))
    expect(description.material.kind).toBe('pinned')
    expect(controls.opens()).toBe(0)
  })

  it('does not answer source-unavailable: the snapshot is not taken either', async () => {
    const { ports } = createWorld()
    const { createSkillAccess } = await import('@omne-harness/skill')
    const access = createSkillAccess({
      ...ports,
      source: {
        snapshot: async () => {
          throw new Error('snapshot must not be called by describe')
        },
        open: async () => {
          throw new Error('open must not be called by describe')
        },
      },
    })
    expect(await access.describe(alice, scope, review)).toHaveProperty('ok')
    expect(failureOf(await access.describe(mallory, scope, review))).toEqual({
      kind: 'not-available-to-you',
    })
  })
})
