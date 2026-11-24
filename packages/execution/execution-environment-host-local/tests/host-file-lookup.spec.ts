// @module-tag slow
// Real host filesystem/native helper; no platform override or filesystem mock.
import { lstat, mkdir, mkdtemp, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHostFileLookup } from '../src/host-file-lookup.ts'

const supported = ['darwin', 'linux', 'win32'].includes(process.platform)
const token = async (path: string) => {
  const info = await lstat(path, { bigint: true })
  return `${info.dev}:${info.ino}`
}

describe(
  'real host file lookup through its held root',
  { tags: ['slow'], skip: !supported },
  () => {
    let base: string, root: string, leaf: string, file: string, sibling: string, identity: string
    beforeEach(async () => {
      base = await realpath(await mkdtemp(join(tmpdir(), 'lookup-root-')))
      root = join(base, 'root')
      leaf = join(root, 'child')
      file = join(leaf, 'AGENTS.md')
      sibling = join(base, 'root-sibling')
      await mkdir(leaf, { recursive: true })
      await mkdir(sibling)
      await writeFile(file, 'one instruction')
      await writeFile(join(sibling, 'AGENTS.md'), 'outside')
      identity = await token(root)
    })
    afterEach(async () => {
      if (base) await rm(base, { recursive: true, force: true })
    })

    it('returns a regular file identity, literal size and canonical containing directory', async () => {
      const result = await createHostFileLookup(root, identity)(file)
      expect(result).toMatchObject({
        ok: true,
        value: { object: { token: expect.any(String) }, size: 15, directory: leaf },
      })
      if (process.platform !== 'win32' && result.ok && result.value)
        expect(result.value.object.token).toBe(await token(file))
    })

    it('proves only a missing final name absent; a missing parent remains unresolved', async () => {
      const lookup = createHostFileLookup(root, identity)
      expect(await lookup(join(leaf, 'missing'))).toEqual({ ok: true, value: null })
      expect(await lookup(join(root, 'missing-parent', 'AGENTS.md'))).toEqual({
        ok: false,
        failure: 'unresolved',
      })
    })

    it('distinguishes a final directory from a non-directory intermediate segment', async () => {
      const lookup = createHostFileLookup(root, identity)
      await writeFile(join(root, 'parent-file'), 'not a directory')
      expect(await lookup(leaf)).toEqual({ ok: false, failure: 'unsupported' })
      expect(await lookup(join(root, 'parent-file', 'AGENTS.md'))).toEqual({
        ok: false,
        failure: 'unresolved',
      })
    })

    it.each(['existing', 'missing'] as const)(
      'refuses a valid foreign root token before reporting %s final entry',
      async kind => {
        const foreign = await token(sibling)
        expect(
          await createHostFileLookup(
            root,
            foreign,
          )(kind === 'existing' ? file : join(leaf, 'missing')),
        ).toEqual({ ok: false, failure: 'notAuthorized' })
      },
    )

    it.each(['prefix-sibling', 'dotdot'] as const)(
      'refuses lexical %s even when the OS could resolve it',
      async kind => {
        const path =
          kind === 'prefix-sibling'
            ? join(sibling, 'AGENTS.md')
            : `${root}${sep}..${sep}root${sep}child${sep}AGENTS.md`
        expect(await createHostFileLookup(root, identity)(path)).toEqual({
          ok: false,
          failure: 'notAuthorized',
        })
      },
    )

    it('refuses an intermediate link or junction into another directory', async () => {
      await symlink(
        sibling,
        join(root, 'escape'),
        process.platform === 'win32' ? 'junction' : 'dir',
      )
      expect(await createHostFileLookup(root, identity)(join(root, 'escape', 'AGENTS.md'))).toEqual(
        {
          ok: false,
          failure: 'notAuthorized',
        },
      )
    })

    it.skipIf(process.platform === 'win32')(
      'does not follow a final symbolic link to a regular file',
      async () => {
        const link = join(leaf, 'linked')
        await symlink(file, link)
        expect(await createHostFileLookup(root, identity)(link)).toEqual({
          ok: false,
          failure: 'unsupported',
        })
      },
    )

    it('keeps an implicitly recorded root identity when its path is replaced', async () => {
      const lookup = createHostFileLookup(root)
      expect((await lookup(file)).ok).toBe(true)
      await rename(root, join(base, 'old-root'))
      await mkdir(leaf, { recursive: true })
      await writeFile(file, 'impostor')
      expect(await lookup(file)).toEqual({ ok: false, failure: 'notAuthorized' })
      expect(await lookup(join(leaf, 'missing'))).toEqual({ ok: false, failure: 'notAuthorized' })
    })

    it('reports an unavailable unrecorded root instead of claiming an absent file', async () => {
      expect(
        await createHostFileLookup(join(base, 'absent-root'))(
          join(base, 'absent-root', 'AGENTS.md'),
        ),
      ).toEqual({ ok: false, failure: 'unavailable' })
    })
  },
)
