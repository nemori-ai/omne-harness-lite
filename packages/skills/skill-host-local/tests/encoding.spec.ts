import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDirectorySource, type DirectoryFs } from '@omne-harness/skill-host-local'
import { realFs } from './fs-double.ts'
import { directory, scratch, writeTree } from './scratch.ts'

const MANIFEST = '---\nname: pkg\ndescription: Names.\n---\n'
const NOT_UTF8 = Buffer.from([0x62, 0x61, 0x64, 0xff])

function under(root: string, ...names: Buffer[]): Buffer {
  return Buffer.concat([Buffer.from(root), ...names.flatMap(name => [Buffer.from('/'), name])])
}

// Whether this file system keeps a name that is not UTF-8. APFS refuses one with EILSEQ.
async function keepsAnyBytes(): Promise<boolean> {
  const probe = await realpath(await mkdtemp(join(tmpdir(), 'skill-host-local-names-')))
  try {
    await writeFile(under(probe, NOT_UTF8), '')
    return true
  } catch (error) {
    if ((error as { code?: unknown }).code === 'EILSEQ') return false
    throw error
  } finally {
    await rm(probe, { recursive: true, force: true })
  }
}
const KEEPS_ANY_BYTES = await keepsAnyBytes()

// The source judges the bytes its file system port gives it, whatever the platform can store. A
// file stands where a lenient decoding of those bytes would look, so only the strict one refuses.
const LENIENT = 'bad\uFFFD'

describe('a name that is not strict UTF-8', () => {
  it('in a listing makes snapshot answer entry-unreadable', async () => {
    const root = join(await scratch(), 'pkg')
    await writeTree(root, { files: { 'SKILL.md': MANIFEST, [LENIENT]: 'text\n' } })
    const fs: DirectoryFs = {
      ...realFs,
      readdir: async path =>
        (await realFs.readdir(path)).map(name =>
          Buffer.from(name).toString() === LENIENT ? NOT_UTF8 : name,
        ),
    }
    expect(await createDirectorySource().snapshot(directory(root))).toHaveProperty('ok')
    expect(await createDirectorySource({ fs }).snapshot(directory(root))).toEqual({
      failure: 'entry-unreadable',
    })
  })

  it('in the resolved path of a link makes snapshot answer entry-unreadable', async () => {
    const root = join(await scratch(), 'pkg')
    await writeTree(root, { files: { 'SKILL.md': MANIFEST, [`z/${LENIENT}`]: 'text\n' } })
    await symlink(`z/${LENIENT}`, join(root, 'a'))
    const fs: DirectoryFs = {
      ...realFs,
      realpath: async path =>
        path === join(root, 'a') ? under(root, Buffer.from('z'), NOT_UTF8) : realFs.realpath(path),
    }
    expect(await createDirectorySource().snapshot(directory(root))).toHaveProperty('ok')
    expect(await createDirectorySource({ fs }).snapshot(directory(root))).toEqual({
      failure: 'entry-unreadable',
    })
  })
})

describe.skipIf(!KEEPS_ANY_BYTES)('a name that is not strict UTF-8, kept on the disk', () => {
  it('of a file makes snapshot answer entry-unreadable', async () => {
    const root = join(await scratch(), 'pkg')
    await writeTree(root, { files: { 'SKILL.md': MANIFEST } })
    await writeFile(under(root, NOT_UTF8), 'text\n')
    expect(await createDirectorySource().snapshot(directory(root))).toEqual({
      failure: 'entry-unreadable',
    })
  })

  it('in the resolved path of a link makes snapshot answer entry-unreadable', async () => {
    const root = join(await scratch(), 'pkg')
    await writeTree(root, { files: { 'SKILL.md': MANIFEST } })
    await mkdir(under(root, Buffer.from('z'), NOT_UTF8), { recursive: true })
    await writeFile(under(root, Buffer.from('z'), NOT_UTF8, Buffer.from('f.md')), 'text\n')
    await symlink(under(Buffer.from('z').toString(), NOT_UTF8), join(root, 'a'))
    expect(await createDirectorySource().snapshot(directory(root))).toEqual({
      failure: 'entry-unreadable',
    })
  })
})

describe('a byte order mark at the start of a name', () => {
  it('stays in the package path, and open reads the file by that path', async () => {
    const root = join(await scratch(), 'pkg')
    await writeTree(root, { files: { 'SKILL.md': MANIFEST, '﻿bom.md': 'marked\n' } })
    const source = createDirectorySource()
    const answer = await source.snapshot(directory(root))
    if (!('ok' in answer)) throw new Error(answer.failure)
    const entry = answer.ok.entries.find(item => item.path === '﻿bom.md')
    if (entry === undefined) throw new Error('the snapshot lists the marked name')
    const bytes = await source.open(directory(root), answer.ok.digest, entry.path)
    expect(bytes).toEqual({ ok: new TextEncoder().encode('marked\n') })
  })
})
