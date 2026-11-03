// The source reads the directory as it is at each call and keeps nothing between calls. A change
// after a snapshot shows in the next `open` and the next `snapshot`; comparing the bytes with the
// snapshot is the caller's work, not the source's.
import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { computeDigest } from '@omne-harness/skill-contract'
import { createDirectorySource } from '@omne-harness/skill-host-local'
import { directory, SAMPLE, scratch, writeTree } from './scratch.ts'

async function samplePackage(): Promise<string> {
  const root = join(await scratch(), 'pkg')
  await writeTree(root, SAMPLE)
  return root
}

describe('a file changed after the snapshot', () => {
  it('is given by open with its new bytes, which do not match the snapshot entry', async () => {
    const root = await samplePackage()
    const source = createDirectorySource()
    const taken = await source.snapshot(directory(root))
    if (!('ok' in taken)) throw new Error(taken.failure)
    const entry = taken.ok.entries.find(item => item.path === 'notes/guide.md')
    if (entry === undefined) throw new Error('the sample package has notes/guide.md')
    await writeFile(join(root, 'notes/guide.md'), '# Guide, changed\n')
    const answer = await source.open(directory(root), taken.ok.digest, entry.path)
    if (!('ok' in answer)) throw new Error(answer.failure)
    expect(new TextDecoder().decode(answer.ok)).toBe('# Guide, changed\n')
    expect(computeDigest(answer.ok)).not.toBe(entry.digest)
  })

  it('changes the next snapshot of the same source', async () => {
    const root = await samplePackage()
    const source = createDirectorySource()
    const first = await source.snapshot(directory(root))
    await writeFile(join(root, 'SKILL.md'), '---\nname: pkg\ndescription: Changed.\n---\n')
    const second = await source.snapshot(directory(root))
    if (!('ok' in first) || !('ok' in second)) throw new Error('both snapshots succeed')
    expect(second.ok.digest).not.toBe(first.ok.digest)
  })
})

describe('a package removed after the snapshot', () => {
  it('is package-not-found for open and for the next snapshot', async () => {
    const root = await samplePackage()
    const source = createDirectorySource()
    const taken = await source.snapshot(directory(root))
    if (!('ok' in taken)) throw new Error(taken.failure)
    const entry = taken.ok.entries[0]
    if (entry === undefined) throw new Error('the sample package has entries')
    await rm(root, { recursive: true })
    expect(await source.open(directory(root), taken.ok.digest, entry.path)).toEqual({
      failure: 'package-not-found',
    })
    expect(await source.snapshot(directory(root))).toEqual({ failure: 'package-not-found' })
  })
})
