import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDirectorySource, directoryPackageReader } from '@omne-harness/skill-host-local'
import { scratch, writeTree } from './scratch.ts'

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)

describe('a skill package in a directory read as the assets read a package', () => {
  it('lists every file with its size and digest, and opens each by the digest it was listed with', async () => {
    const root = join(await scratch(), 'notes')
    const files = { 'SKILL.md': '---\nname: notes\n---\nKeep it short.\n', 'guide.md': '# Guide\n' }
    await writeTree(root, { files })
    const reader = directoryPackageReader(createDirectorySource(), root)
    const listed = await reader.manifest()
    if (!('ok' in listed)) throw new Error(listed.failure)
    const size = (content: string) => new TextEncoder().encode(content).length
    expect(listed.ok.entries.map(entry => [entry.path, entry.bytes])).toEqual([
      ['SKILL.md', size(files['SKILL.md'])],
      ['guide.md', size(files['guide.md'])],
    ])
    const guide = listed.ok.entries.find(entry => entry.path === 'guide.md')!
    const opened = await reader.open('guide.md', guide.digest)
    if (!('ok' in opened)) throw new Error(opened.failure)
    expect(text(opened.ok)).toBe('# Guide\n')
  })

  it('a path it did not list, or a digest the file no longer has, is not found', async () => {
    const root = join(await scratch(), 'notes')
    await writeTree(root, { files: { 'SKILL.md': '---\nname: notes\n---\n' } })
    const reader = directoryPackageReader(createDirectorySource(), root)
    const listed = await reader.manifest()
    if (!('ok' in listed)) throw new Error(listed.failure)
    const [skill] = listed.ok.entries
    expect(await reader.open('gone.md', skill!.digest)).toEqual({ failure: 'entry-not-found' })
    expect(await reader.open('SKILL.md', 'sha256:0')).toEqual({ failure: 'entry-not-found' })
  })

  it('a directory that is not there answers unavailable', async () => {
    const reader = directoryPackageReader(createDirectorySource(), join(await scratch(), 'none'))
    expect(await reader.manifest()).toEqual({ failure: 'unavailable' })
    expect(await reader.open('SKILL.md', 'sha256:0')).toEqual({ failure: 'unavailable' })
  })
})
