// Refusals of the file system, made through the injected `DirectoryFs` seam: the tests run as any
// user, root included, because no file mode is involved. Each refusal comes back as the source
// failure that the README "Behavior" section gives for it.
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

describe('a file that cannot be read', () => {
  it.each(['EACCES', 'EPERM', 'EIO'])(
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
})

describe('a directory inside the package that cannot be read', () => {
  it('makes snapshot answer entry-unreadable', async () => {
    const root = await samplePackage()
    expect(await snapshot(failing('readdir', named('notes'), refusal('EACCES')), root)).toBe(
      'entry-unreadable',
    )
  })
})

describe('a link that cannot be resolved for lack of permission', () => {
  it('makes snapshot answer entry-unreadable', async () => {
    const root = await samplePackage()
    expect(
      await snapshot(failing('realpath', named('guide-link.md'), refusal('EACCES')), root),
    ).toBe('entry-unreadable')
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

  it('when it cannot be resolved for ENOENT answers package-not-found in snapshot and open', async () => {
    const root = await samplePackage()
    const fs = failing('realpath', named('pkg'), refusal('ENOENT'))
    expect(await snapshot(fs, root)).toBe('package-not-found')
    expect(await open(fs, root, 'SKILL.md')).toBe('package-not-found')
  })

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
