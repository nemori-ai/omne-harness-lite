// An entry that another writer replaces by a link to a file outside the root while the source
// reads the package. The source must never give the bytes of the outside file: it resolves every
// entry before it reads it, and it opens the resolved file without following a final link.
// The seam below runs the real file system and makes the replacement at one exact step.
import { readFile, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isPackageDigest, isPackagePath } from '@omne-harness/skill-contract'
import { createDirectorySource, type DirectoryFs } from '@omne-harness/skill-host-local'
import { realFs } from './fs-double.ts'
import { directory, scratch, writeTree } from './scratch.ts'

const MANIFEST = '---\nname: pkg\ndescription: Swap.\n---\n'

/** A package `pkg` with `doc.md`, and `secret.txt` beside it, outside the package. */
async function world(): Promise<
  Readonly<{ root: string; doc: string; swap: () => Promise<void> }>
> {
  const base = await scratch()
  const root = join(base, 'pkg')
  await writeTree(base, { files: { 'secret.txt': 'secret\n' } })
  await writeTree(root, { files: { 'SKILL.md': MANIFEST, 'doc.md': 'inside\n' } })
  const doc = join(root, 'doc.md')
  const swap = async () => {
    await rm(doc)
    await symlink('../secret.txt', doc)
  }
  return { root, doc, swap }
}

describe('an entry replaced by a link to outside the root', () => {
  it('after the listing makes snapshot answer outside-package', async () => {
    const { root, swap } = await world()
    const fs: DirectoryFs = {
      ...realFs,
      readdir: async path => {
        const listing = await realFs.readdir(path)
        if (path === root) await swap()
        return listing
      },
    }
    expect(await createDirectorySource({ fs }).snapshot(directory(root))).toEqual({
      failure: 'outside-package',
    })
  })

  it('after the source checked its kind makes snapshot answer entry-unreadable', async () => {
    const { root, doc, swap } = await world()
    const fs: DirectoryFs = {
      ...realFs,
      lstat: async path => {
        const kind = await realFs.lstat(path)
        if (path === doc) await swap()
        return kind
      },
    }
    expect(await createDirectorySource({ fs }).snapshot(directory(root))).toEqual({
      failure: 'entry-unreadable',
    })
    expect(await readFile(doc, 'utf8')).toBe('secret\n')
  })

  it('after open resolved the path makes open answer unavailable', async () => {
    const { root, doc, swap } = await world()
    const fs: DirectoryFs = {
      ...realFs,
      realpath: async path => {
        const resolved = await realFs.realpath(path)
        if (path === doc) await swap()
        return resolved
      },
    }
    const digest = `sha256:${'0'.repeat(64)}`
    const path = 'doc.md'
    if (!isPackageDigest(digest) || !isPackagePath(path)) throw new TypeError(digest)
    expect(await createDirectorySource({ fs }).open(directory(root), digest, path)).toEqual({
      failure: 'unavailable',
    })
  })
})
