import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { digestBytes } from '@omne-harness/assets'
import { describe, expect, it } from 'vitest'
import { loadHeldFile } from '../../../src/rows/plugin-server/load.ts'

const HELD = { asset: 'held/tidy', version: `sha256:${'a'.repeat(64)}` }
const TEXT = 'export const make = () => "made"\n'
const DIGEST = digestBytes(new TextEncoder().encode(TEXT))

function placed() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-plugin-load-')))
  mkdirSync(join(root, 'lib'))
  writeFileSync(join(root, 'lib', 'make.js'), TEXT)
  const asked: unknown[] = []
  const packages = {
    async locate(input: unknown) {
      asked.push(input)
      return { kind: 'local-directory', path: root } as const
    },
  }
  return { root, packages, asked }
}

describe('loading a file of a held version on the server', () => {
  it('loads it from the directory of that version once its bytes match the digest', async () => {
    const { packages, asked } = placed()
    const loaded = await loadHeldFile(packages, HELD, { path: 'lib/make.js', digest: DIGEST })
    expect((loaded as { make(): string }).make()).toBe('made')
    expect(asked).toEqual([{ assetRef: 'held/tidy', version: HELD.version }])
  })

  it.each([
    [
      'bytes that do not match the digest',
      { path: 'lib/make.js', digest: `sha256:${'0'.repeat(64)}` },
      'lib/make.js does not match its digest',
    ],
    [
      'a path that leaves the package',
      { path: '../make.js', digest: DIGEST },
      '../make.js is not a file inside the package',
    ],
  ])('loads nothing for %s', async (_name, file, reason) => {
    const { packages } = placed()
    const loads: string[] = []
    await expect(
      loadHeldFile(packages, HELD, file, async url => void loads.push(url)),
    ).rejects.toThrow(reason)
    expect(loads).toEqual([])
  })

  it.each([
    ['absent', 'this version has no directory on this machine to load from'],
    ['unavailable', 'the package cannot be read now'],
  ] as const)('says why when the package is %s here', async (kind, reason) => {
    const packages = { locate: async () => ({ kind }) }
    await expect(
      loadHeldFile(packages, HELD, { path: 'lib/make.js', digest: DIGEST }),
    ).rejects.toThrow(reason)
    await expect(
      loadHeldFile(undefined, HELD, { path: 'lib/make.js', digest: DIGEST }),
    ).rejects.toThrow('the assets of the tenant cannot be opened now')
  })
})
