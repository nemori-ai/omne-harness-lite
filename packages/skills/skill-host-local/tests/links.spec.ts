// Links and objects that are not regular files, on real temporary directories. A link inside the
// package reads the bytes it points to; a link that resolves outside the resolved root makes the
// whole package unreadable as `outside-package`; a dangling or cyclic link, a pipe and a socket make
// it `entry-unreadable`.
import { execFile } from 'node:child_process'
import { createServer, type Server } from 'node:net'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it, onTestFinished } from 'vitest'
import { isPackageDigest, isPackagePath, type PackagePath } from '@omne-harness/skill-contract'
import type { SkillPackageSource } from '@omne-harness/skill-contract/provider'
import { createDirectorySource, type DirectoryFs } from '@omne-harness/skill-host-local'
import { realFs } from './fs-double.ts'
import { directory, scratch, writeTree } from './scratch.ts'

const MANIFEST = '---\nname: pkg\ndescription: Links.\n---\n'
const ANY_DIGEST = `sha256:${'0'.repeat(64)}`

function path(text: string): PackagePath {
  if (!isPackagePath(text)) throw new TypeError(text)
  return text
}

async function openText(source: SkillPackageSource, root: string, at: string) {
  if (!isPackageDigest(ANY_DIGEST)) throw new TypeError(ANY_DIGEST)
  const answer = await source.open(directory(root), ANY_DIGEST, path(at))
  return 'ok' in answer ? { ok: new TextDecoder().decode(answer.ok) } : answer
}

async function snapshotFailure(root: string) {
  const answer = await createDirectorySource().snapshot(directory(root))
  return 'ok' in answer ? 'snapshot' : answer.failure
}

describe('a link inside the package', () => {
  it('reads the bytes of its target in snapshot and in open', async () => {
    const root = join(await scratch(), 'pkg')
    await writeTree(root, {
      files: { 'SKILL.md': MANIFEST, 'docs/real.md': 'the real bytes\n' },
      links: { 'docs/alias.md': 'real.md', 'top.md': 'docs/real.md' },
    })
    const source = createDirectorySource()
    const answer = await source.snapshot(directory(root))
    if (!('ok' in answer)) throw new Error(answer.failure)
    const digestOf = (at: string) => answer.ok.entries.find(entry => entry.path === at)?.digest
    expect(digestOf('docs/alias.md')).toBe(digestOf('docs/real.md'))
    expect(digestOf('top.md')).toBe(digestOf('docs/real.md'))
    expect(await openText(source, root, 'docs/alias.md')).toEqual({ ok: 'the real bytes\n' })
  })

  it('to a directory lists the files of that directory under the link path', async () => {
    const root = join(await scratch(), 'pkg')
    await writeTree(root, {
      files: { 'SKILL.md': MANIFEST, 'docs/real.md': 'text\n' },
      links: { mirror: 'docs' },
    })
    const answer = await createDirectorySource().snapshot(directory(root))
    if (!('ok' in answer)) throw new Error(answer.failure)
    expect(answer.ok.entries.map(entry => entry.path)).toEqual([
      'SKILL.md',
      'docs/real.md',
      'mirror/real.md',
    ])
  })

  it('is judged against the resolved root when the root itself is a link', async () => {
    const base = await scratch()
    await writeTree(join(base, 'real-pkg'), {
      files: { 'SKILL.md': MANIFEST, 'body.md': 'body\n' },
      links: { 'absolute.md': join(base, 'real-pkg', 'body.md') },
    })
    await writeTree(base, { links: { pkg: 'real-pkg' } })
    const answer = await createDirectorySource().snapshot(directory(join(base, 'pkg')))
    if (!('ok' in answer)) throw new Error(answer.failure)
    expect(answer.ok.rootName).toBe('real-pkg')
    expect(answer.ok.entries.map(entry => entry.path)).toEqual([
      'SKILL.md',
      'absolute.md',
      'body.md',
    ])
  })
})

describe('a link that resolves outside the root', () => {
  it('makes snapshot answer outside-package, and open of it too', async () => {
    const base = await scratch()
    const root = join(base, 'pkg')
    await writeTree(base, { files: { 'secret.txt': 'secret\n' } })
    await writeTree(root, {
      files: { 'SKILL.md': MANIFEST },
      links: { 'leak.txt': '../secret.txt' },
    })
    expect(await snapshotFailure(root)).toBe('outside-package')
    expect(await openText(createDirectorySource(), root, 'leak.txt')).toEqual({
      failure: 'outside-package',
    })
  })

  it('is outside when it points into a sibling whose name starts with the root name', async () => {
    const base = await scratch()
    const root = join(base, 'pkg')
    await writeTree(join(base, 'pkg-sibling'), { files: { 'secret.txt': 'secret\n' } })
    await writeTree(root, {
      files: { 'SKILL.md': MANIFEST },
      links: { 'leak.txt': '../pkg-sibling/secret.txt' },
    })
    expect(await snapshotFailure(root)).toBe('outside-package')
    expect(await openText(createDirectorySource(), root, 'leak.txt')).toEqual({
      failure: 'outside-package',
    })
  })
})

describe('a link that cannot be resolved', () => {
  it('that dangles makes snapshot answer entry-unreadable', async () => {
    const root = join(await scratch(), 'pkg')
    await writeTree(root, { files: { 'SKILL.md': MANIFEST }, links: { 'gone.md': 'missing.md' } })
    expect(await snapshotFailure(root)).toBe('entry-unreadable')
  })

  it('in a cycle of file links makes snapshot answer entry-unreadable', async () => {
    const root = join(await scratch(), 'pkg')
    await writeTree(root, { files: { 'SKILL.md': MANIFEST }, links: { a: 'b', b: 'a' } })
    expect(await snapshotFailure(root)).toBe('entry-unreadable')
  })

  it('to the root or to a directory above it in the package makes snapshot answer entry-unreadable', async () => {
    const self = join(await scratch(), 'pkg')
    await writeTree(self, { files: { 'SKILL.md': MANIFEST }, links: { loop: '.' } })
    expect(await snapshotFailure(self)).toBe('entry-unreadable')
    const up = join(await scratch(), 'pkg')
    await writeTree(up, {
      files: { 'SKILL.md': MANIFEST, 'sub/x.md': 'x\n' },
      links: { 'sub/up': '..' },
    })
    expect(await snapshotFailure(up)).toBe('entry-unreadable')
  })
})

describe('an entry that is not a regular file', () => {
  it('a named pipe makes snapshot answer entry-unreadable', async ctx => {
    const root = join(await scratch(), 'pkg')
    await writeTree(root, { files: { 'SKILL.md': MANIFEST } })
    try {
      await promisify(execFile)('mkfifo', [join(root, 'pipe')])
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')
        return ctx.skip('NotApplicable: no mkfifo command on this host')
      throw error
    }
    expect(await snapshotFailure(root)).toBe('entry-unreadable')
  })

  it('a unix socket makes snapshot answer entry-unreadable', async () => {
    const root = join(await scratch(), 'pkg')
    await writeTree(root, { files: { 'SKILL.md': MANIFEST } })
    const server: Server = createServer()
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(join(root, 'socket'), resolve)
    })
    onTestFinished(() => new Promise<void>(resolve => server.close(() => resolve())))
    expect(await snapshotFailure(root)).toBe('entry-unreadable')
  })
})

describe('two faults in one package', () => {
  it('answer the fault of the first name in code unit order, whatever the listing order', async () => {
    const base = await scratch()
    await writeTree(base, { files: { 'secret.txt': 'secret\n' } })
    const first = join(base, 'dangling-first')
    await writeTree(first, { links: { a: 'missing', b: '../secret.txt' } })
    const second = join(base, 'leak-first')
    await writeTree(second, { links: { b: 'missing', a: '../secret.txt' } })
    const reversed: DirectoryFs = {
      ...realFs,
      readdir: async path => [...(await realFs.readdir(path))].reverse(),
    }
    for (const fs of [realFs, reversed]) {
      const source = createDirectorySource({ fs })
      expect(await source.snapshot(directory(first))).toEqual({ failure: 'entry-unreadable' })
      expect(await source.snapshot(directory(second))).toEqual({ failure: 'outside-package' })
    }
  })
})
