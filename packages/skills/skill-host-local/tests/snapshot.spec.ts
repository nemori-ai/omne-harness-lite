// What one snapshot of a real directory holds: every file under the root, hidden ones and the
// `.omne` directory included, as `/`-separated package paths; directories, empty ones included,
// are not entries; the root name is the last segment of the root. A locator of another kind, an
// absent root and a root that is a file name no package of this source.
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isPackageDigest } from '@omne-harness/skill-contract'
import { createDirectorySource } from '@omne-harness/skill-host-local'
import { directory, SAMPLE, scratch, writeTree } from './scratch.ts'

describe('snapshot of a directory', () => {
  it('lists every file under the root and no directory', async () => {
    const root = join(await scratch(), 'pkg')
    await writeTree(root, SAMPLE)
    const answer = await createDirectorySource().snapshot(directory(root))
    if (!('ok' in answer)) throw new Error(answer.failure)
    expect(answer.ok.rootName).toBe('pkg')
    expect(answer.ok.entries.map(entry => entry.path)).toEqual([
      '.hidden',
      '.omne/skill.json',
      'SKILL.md',
      'notes/deep/data.bin',
      'notes/guide-link.md',
      'notes/guide.md',
    ])
  })

  it('of an empty directory has no entries', async () => {
    const root = join(await scratch(), 'empty-pkg')
    await writeTree(root, {})
    const answer = await createDirectorySource().snapshot(directory(root))
    if (!('ok' in answer)) throw new Error(answer.failure)
    expect(answer.ok.entries).toEqual([])
  })

  it('answers package-not-found for a root that is a file', async () => {
    const base = await scratch()
    await writeTree(base, { files: { pkg: 'a file, not a directory\n' } })
    expect(await createDirectorySource().snapshot(directory(join(base, 'pkg')))).toEqual({
      failure: 'package-not-found',
    })
  })

  it('answers package-not-found for a root that resolves to the file system root', async () => {
    expect(await createDirectorySource().snapshot(directory('/'))).toEqual({
      failure: 'package-not-found',
    })
  })
})

describe('a content-store locator', () => {
  it('names no package of a directory source, in snapshot and in open', async () => {
    const digest = `sha256:${'a'.repeat(64)}`
    if (!isPackageDigest(digest)) throw new TypeError(digest)
    const root = join(await scratch(), 'pkg')
    await writeTree(root, SAMPLE)
    const source = createDirectorySource()
    const present = await source.snapshot(directory(root))
    if (!('ok' in present)) throw new Error(present.failure)
    const locator = { kind: 'content-store', digest: present.ok.digest } as const
    expect(await source.snapshot(locator)).toEqual({ failure: 'package-not-found' })
    const first = present.ok.entries[0]
    if (first === undefined) throw new Error('the sample package has entries')
    expect(await source.open(locator, digest, first.path)).toEqual({ failure: 'package-not-found' })
  })
})
