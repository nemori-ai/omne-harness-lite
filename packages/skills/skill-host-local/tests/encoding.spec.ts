// Names as the file system stores them: bytes. A name or a resolved path that is not strict UTF-8
// cannot become a package path, and that is a fault of the package, not a passing failure of the
// source. A byte order mark at the start of a name is part of the name.
import { mkdir, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDirectorySource } from '@omne-harness/skill-host-local'
import { directory, scratch, writeTree } from './scratch.ts'

const MANIFEST = '---\nname: pkg\ndescription: Names.\n---\n'
const NOT_UTF8 = Buffer.from([0x62, 0x61, 0x64, 0xff])

function under(root: string, ...names: Buffer[]): Buffer {
  return Buffer.concat([Buffer.from(root), ...names.flatMap(name => [Buffer.from('/'), name])])
}

describe('a name that is not strict UTF-8', () => {
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
