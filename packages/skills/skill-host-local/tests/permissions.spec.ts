// Refusals of the file system, made through the injected `DirectoryFs` seam: the tests run as any
// user, root included, because no file mode is involved. Each refusal comes back as the source
// failure that the README "Behavior" section gives for it. Every code that a table of the source
// lists has its own case here, so a code removed from a table turns a case red.
import { rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isPackageDigest, isPackagePath } from '@omne-harness/skill-contract'
import { createDirectorySource, type DirectoryFs } from '@omne-harness/skill-host-local'
import { failing, realFs, refusal } from './fs-double.ts'
import { directory, scratch, writeTree } from './scratch.ts'

const DIGEST = `sha256:${'0'.repeat(64)}`

async function samplePackage(): Promise<string> {
  const root = join(await scratch(), 'pkg')
  await writeTree(root, {
    files: {
      'SKILL.md': '---\nname: pkg\ndescription: Permissions.\n---\n',
      'notes/guide.md': '# Guide\n',
    },
    links: { 'guide-link.md': 'notes/guide.md' },
  })
  return root
}

async function snapshot(fs: DirectoryFs, root: string) {
  const answer = await createDirectorySource({ fs }).snapshot(directory(root))
  return 'ok' in answer ? 'snapshot' : answer.failure
}

async function open(fs: DirectoryFs, root: string, at: string) {
  if (!isPackageDigest(DIGEST) || !isPackagePath(at)) throw new TypeError(at)
  const answer = await createDirectorySource({ fs }).open(directory(root), DIGEST, at)
  return 'ok' in answer ? 'bytes' : answer.failure
}

const named = (name: string) => (path: string) => basename(path) === name

/** The codes that make an entry unreadable when the source resolves it or reads its kind. */
const RESOLVE_CODES = ['ELOOP', 'ENOTDIR', 'EACCES', 'EPERM', 'EIO']
/** The codes that make an entry unreadable when the source lists a directory or reads a file. */
const READ_CODES = ['EACCES', 'EPERM', 'EIO', 'ELOOP', 'ENXIO']

describe('a file that cannot be read', () => {
  it.each(READ_CODES)(
    'with %s makes snapshot answer entry-unreadable and open answer unavailable',
    async code => {
      const root = await samplePackage()
      const fs = failing('readFile', named('guide.md'), refusal(code))
      expect(await snapshot(fs, root)).toBe('entry-unreadable')
      expect(await open(fs, root, 'notes/guide.md')).toBe('unavailable')
      expect(await open(fs, root, 'SKILL.md')).toBe('bytes')
    },
  )

  it('that vanished after the listing makes snapshot answer unavailable', async () => {
    const root = await samplePackage()
    const fs = failing('readFile', named('guide.md'), refusal('ENOENT'))
    expect(await snapshot(fs, root)).toBe('unavailable')
  })

  it('that vanished after open resolved it makes open answer entry-not-found', async () => {
    const root = await samplePackage()
    const fs = failing('readFile', named('guide.md'), refusal('ENOENT'))
    expect(await open(fs, root, 'notes/guide.md')).toBe('entry-not-found')
  })
})

describe('an object that is not a regular file when the source opens it', () => {
  const opened = (kind: 'directory' | 'other'): DirectoryFs => ({
    ...realFs,
    readFile: async path => (named('guide.md')(path) ? { kind } : realFs.readFile(path)),
  })

  it('makes snapshot answer unavailable for a directory and entry-unreadable for another object', async () => {
    const root = await samplePackage()
    expect(await snapshot(opened('directory'), root)).toBe('unavailable')
    expect(await snapshot(opened('other'), root)).toBe('entry-unreadable')
  })

  it('makes open answer entry-not-found for a directory and unavailable for another object', async () => {
    const root = await samplePackage()
    expect(await open(opened('directory'), root, 'notes/guide.md')).toBe('entry-not-found')
    expect(await open(opened('other'), root, 'notes/guide.md')).toBe('unavailable')
  })
})

describe('a directory inside the package that cannot be listed', () => {
  it.each(READ_CODES)('with %s makes snapshot answer entry-unreadable', async code => {
    const root = await samplePackage()
    expect(await snapshot(failing('readdir', named('notes'), refusal(code)), root)).toBe(
      'entry-unreadable',
    )
  })
})

describe('an entry that cannot be resolved', () => {
  it.each(RESOLVE_CODES)('with %s makes snapshot answer entry-unreadable', async code => {
    const root = await samplePackage()
    expect(await snapshot(failing('realpath', named('guide-link.md'), refusal(code)), root)).toBe(
      'entry-unreadable',
    )
  })

  it('with a code that the source does not list makes snapshot answer unavailable', async () => {
    const root = await samplePackage()
    expect(
      await snapshot(failing('realpath', named('guide-link.md'), refusal('EMFILE')), root),
    ).toBe('unavailable')
  })
})

describe('an entry whose kind cannot be read after it was resolved', () => {
  it.each(RESOLVE_CODES)('with %s makes snapshot answer entry-unreadable', async code => {
    const root = await samplePackage()
    expect(await snapshot(failing('lstat', named('guide.md'), refusal(code)), root)).toBe(
      'entry-unreadable',
    )
  })

  it('because it vanished (ENOENT) makes snapshot answer unavailable', async () => {
    const root = await samplePackage()
    expect(await snapshot(failing('lstat', named('guide.md'), refusal('ENOENT')), root)).toBe(
      'unavailable',
    )
  })
})

describe('a link that cannot be resolved because its target is missing', () => {
  it('answers entry-unreadable while the link itself is still there', async () => {
    const root = await samplePackage()
    expect(
      await snapshot(failing('realpath', named('guide-link.md'), refusal('ENOENT')), root),
    ).toBe('entry-unreadable')
  })

  it('answers unavailable when the link itself vanished after the listing', async () => {
    const root = await samplePackage()
    const fs: DirectoryFs = {
      ...realFs,
      readdir: async path => {
        const listing = await realFs.readdir(path)
        if (path === root) await rm(join(root, 'guide-link.md'))
        return listing
      },
    }
    expect(await snapshot(fs, root)).toBe('unavailable')
  })
})

describe('the root directory', () => {
  it.each(['EACCES', 'EIO'])('when its listing fails with %s answers unavailable', async code => {
    const root = await samplePackage()
    expect(await snapshot(failing('readdir', named('pkg'), refusal(code)), root)).toBe(
      'unavailable',
    )
  })

  it.each(['ENOENT', 'ENOTDIR'])(
    'when its listing fails with %s answers package-not-found',
    async code => {
      const root = await samplePackage()
      expect(await snapshot(failing('readdir', named('pkg'), refusal(code)), root)).toBe(
        'package-not-found',
      )
    },
  )

  it.each(['ENOENT', 'ENOTDIR'])(
    'when it cannot be resolved for %s answers package-not-found in snapshot and open',
    async code => {
      const root = await samplePackage()
      const fs = failing('realpath', named('pkg'), refusal(code))
      expect(await snapshot(fs, root)).toBe('package-not-found')
      expect(await open(fs, root, 'SKILL.md')).toBe('package-not-found')
    },
  )

  it('when it cannot be resolved for EACCES answers unavailable in snapshot and open', async () => {
    const root = await samplePackage()
    const fs = failing('realpath', named('pkg'), refusal('EACCES'))
    expect(await snapshot(fs, root)).toBe('unavailable')
    expect(await open(fs, root, 'SKILL.md')).toBe('unavailable')
  })
})

describe('a seam that does not answer like a file system', () => {
  it('throws an error without a code on to the caller instead of answering a failure', async () => {
    const root = await samplePackage()
    const bug = new TypeError('a bug in the seam')
    await expect(
      createDirectorySource({ fs: failing('readFile', named('guide.md'), bug) }).snapshot(
        directory(root),
      ),
    ).rejects.toBe(bug)
  })

  it('that lists one name twice makes snapshot answer entry-unreadable', async () => {
    const root = await samplePackage()
    const fs: DirectoryFs = {
      ...realFs,
      readdir: async path => {
        const listing = await realFs.readdir(path)
        return [...listing, ...listing]
      },
    }
    expect(await snapshot(fs, root)).toBe('entry-unreadable')
  })
})
