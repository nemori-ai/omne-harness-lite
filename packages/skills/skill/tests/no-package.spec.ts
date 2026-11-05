// Material without a readable package (its asset body has no `package.digest`). Without a basis
// the operations that read answer `unsupported`; with a basis the port echoes the digest of the
// basis (PR3), so the material is pinned like any other and the source decides: it holds no
// package where the reference points, so the read answers `basis-unavailable`.
import { describe, expect, it } from 'vitest'
import type { ReadTarget } from '@omne-harness/skill-contract'
import {
  alice,
  createWorld,
  currentDigest,
  failureOf,
  noPackage,
  okOf,
  scope,
} from './access-world.ts'

const basis = { capability: noPackage, layer: 'workspace' as const, digest: currentDigest }

describe('material without a readable package, with a basis (PR3)', () => {
  it('describe gives the basis as the pinned material and takes no snapshot', async () => {
    const { access, controls } = createWorld()
    const description = okOf(await access.describe(alice, scope, noPackage, { basis }))
    expect(description.material).toStrictEqual({ kind: 'pinned', basis })
    expect(controls.calls().snapshot).toBe(0)
  })

  it.each([
    [
      'read',
      (w: ReturnType<typeof createWorld>) =>
        w.access.read(alice, scope, { capability: noPackage, part: { kind: 'body' } }, { basis }),
    ],
    [
      'list',
      (w: ReturnType<typeof createWorld>) => w.access.list(alice, scope, noPackage, { basis }),
    ],
    [
      'export',
      (w: ReturnType<typeof createWorld>) => w.access.export(alice, scope, noPackage, basis),
    ],
  ])(
    '%s takes the snapshot where the reference points, finds no package and answers basis-unavailable',
    async (_operation, call) => {
      const world = createWorld()
      expect(await call(world)).toStrictEqual({ failure: { kind: 'basis-unavailable' } })
      expect(world.controls.calls().snapshot).toBe(1)
      expect(world.controls.calls().open).toBe(0)
    },
  )

  it('read with a bad path answers bad-path before any source call, not unsupported', async () => {
    const { access, controls } = createWorld()
    const bad: ReadTarget = { capability: noPackage, part: { kind: 'resource', path: '../x.md' } }
    expect(failureOf(await access.read(alice, scope, bad, { basis }))).toStrictEqual({
      kind: 'bad-path',
    })
    expect(controls.calls().snapshot).toBe(0)
  })
})
