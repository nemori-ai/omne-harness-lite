import { execFileSync } from 'node:child_process'
import { chmod, mkdir, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readWorkingCopy } from '@omne-harness/workspace-git'
import { COMMIT, LATER, digestOf, linked, plain, repository, sandbox } from './repositories.ts'

let box: Awaited<ReturnType<typeof sandbox>>
let count = 0
const next = () => `copy-${++count}`
beforeAll(async () => {
  box = await sandbox()
})
afterAll(async () => {
  await box.dispose()
})

const NOT_ONE = { refused: 'not-a-working-copy' }
const headOf = async (root: string) => {
  const read = await readWorkingCopy(root)
  return 'ok' in read ? read.ok.head : read
}

describe('reading a working copy from its files', () => {
  it('gives the shared directory of the repository, what tells it apart, and the commit of the branch', async () => {
    const root = await repository(box.root, next())
    const before = await digestOf(root)
    const read = await readWorkingCopy(root)
    expect(read).toEqual({
      ok: {
        repository: {
          commonDirectory: join(root, '.git'),
          identity: expect.stringMatching(/^\d+:\d+$/u),
        },
        head: COMMIT,
      },
    })
    expect(await digestOf(root)).toBe(before)
  })

  it('a linked working copy names the same repository and its own commit', async () => {
    const root = await repository(box.root, next())
    const other = await linked(root, box.root, next(), LATER)
    const [main, copy] = [await readWorkingCopy(root), await readWorkingCopy(other)]
    if (!('ok' in main) || !('ok' in copy)) throw new Error(JSON.stringify([main, copy]))
    expect(copy.ok.repository).toEqual(main.ok.repository)
    expect([main.ok.head, copy.ok.head]).toEqual([COMMIT, LATER])
  })

  it('reads the commit of a detached HEAD, of a packed ref, of a ref that names a ref, and of no commit yet', async () => {
    const root = await repository(box.root, next())
    const git = join(root, '.git')
    await writeFile(join(git, 'HEAD'), `${LATER}\n`)
    expect(await headOf(root)).toBe(LATER)
    await writeFile(join(git, 'HEAD'), `${'c'.repeat(64)}\n`)
    expect(await headOf(root)).toBe('c'.repeat(64))
    await writeFile(join(git, 'HEAD'), 'ref: refs/heads/main\n')
    await rm(join(git, 'refs', 'heads', 'main'))
    expect(await headOf(root)).toBe('unborn:refs/heads/main')
    const packed = `# pack-refs with: peeled fully-peeled sorted\n${LATER} refs/heads/other\n${COMMIT} refs/heads/main\n^${LATER}\n`
    for (const line of [
      `x${COMMIT} refs/heads/main`,
      `${COMMIT} refs/heads/main more`,
      'a refs/heads/main',
    ]) {
      await writeFile(join(git, 'packed-refs'), `${line}\n`)
      expect(await headOf(root)).toBe('unborn:refs/heads/main')
    }
    await writeFile(join(git, 'packed-refs'), `${'d'.repeat(64)} refs/heads/main\n`)
    expect(await headOf(root)).toBe('d'.repeat(64))
    await writeFile(join(git, 'packed-refs'), packed)
    expect(await headOf(root)).toBe(COMMIT)
    await writeFile(join(git, 'refs', 'heads', 'main'), `${LATER}\n`)
    expect(await headOf(root)).toBe(LATER)
    await writeFile(join(git, 'refs', 'heads', 'alias'), 'ref: refs/heads/main\n')
    await writeFile(join(git, 'HEAD'), 'ref: refs/heads/alias\n')
    expect(await headOf(root)).toBe(LATER)
  })

  it('is not one: a plain directory, a `.git` that is a link, a directory without objects or without HEAD', async () => {
    const bare = await plain(box.root, next())
    expect(await readWorkingCopy(bare)).toEqual(NOT_ONE)
    const real = await repository(box.root, next())
    await symlink(join(real, '.git'), join(bare, '.git'))
    expect(await readWorkingCopy(bare)).toEqual(NOT_ONE)
    const hollow = await repository(box.root, next())
    await rm(join(hollow, '.git', 'objects'), { recursive: true })
    expect(await readWorkingCopy(hollow)).toEqual(NOT_ONE)
    const headless = await repository(box.root, next())
    await rm(join(headless, '.git', 'HEAD'))
    expect(await readWorkingCopy(headless)).toEqual(NOT_ONE)
  })

  it('is not one: a `.git` file that points at a repository which does not list this directory', async () => {
    const root = await repository(box.root, next())
    const copy = await linked(root, box.root, next())
    const forged = await plain(box.root, next())
    await writeFile(
      join(forged, '.git'),
      `gitdir: ${join(root, '.git', 'worktrees', copy.split('/').pop()!)}\n`,
    )
    expect(await readWorkingCopy(forged)).toEqual(NOT_ONE)
    const moved = `${copy}.moved`
    await rename(copy, moved)
    expect(await readWorkingCopy(moved)).toEqual(NOT_ONE)
    const lost = await plain(box.root, next())
    for (const target of [join(box.root, 'nowhere'), join(root, 'README.md')]) {
      await writeFile(join(lost, '.git'), `gitdir: ${target}\n`)
      expect(await readWorkingCopy(lost)).toEqual(NOT_ONE)
    }
  })

  it('refuses a repository whose refs are kept in the reftable format', async () => {
    const root = await repository(box.root, next())
    await mkdir(join(root, '.git', 'reftable'))
    expect(await readWorkingCopy(root)).toEqual({ refused: 'unsupported-ref-format', final: true })
  })

  it('reads a ref as Git reads it: any name Git allows, with or without the space after `ref:`', async () => {
    const root = await repository(box.root, next())
    const git = join(root, '.git')
    await mkdir(join(git, 'refs', 'heads', 'fix'))
    for (const name of ['fix/#1+a@b', '功能', 'v1.2_rc']) {
      await writeFile(join(git, 'refs', 'heads', name), `${LATER}\n`)
      for (const head of [
        `ref: refs/heads/${name}`,
        `ref:refs/heads/${name}`,
        `ref:  refs/heads/${name}\n`,
      ]) {
        await writeFile(join(git, 'HEAD'), head)
        expect(await headOf(root)).toBe(LATER)
      }
    }
  })

  it('follows a ref that names a ref as far as Git does, and no further', async () => {
    const root = await repository(box.root, next())
    const heads = join(root, '.git', 'refs', 'heads')
    for (const hop of [1, 2, 3])
      await writeFile(join(heads, `hop-${hop}`), `ref: refs/heads/hop-${hop + 1}\n`)
    await writeFile(join(heads, 'hop-4'), `${LATER}\n`)
    await writeFile(join(root, '.git', 'HEAD'), 'ref: refs/heads/hop-1\n')
    expect(await headOf(root)).toBe(LATER)
    await writeFile(join(heads, 'hop-4'), 'ref: refs/heads/main\n')
    expect(await headOf(root)).toEqual({ unavailable: 'HEAD follows too many refs' })
  })

  it('reads a HEAD as large as a small file may be, and not one byte larger', async () => {
    const root = await repository(box.root, next())
    const head = join(root, '.git', 'HEAD')
    const text = 'ref: refs/heads/main'
    await writeFile(head, text.padEnd(4096, '\n'))
    expect(await headOf(root)).toBe(COMMIT)
    await writeFile(head, text.padEnd(4097, '\n'))
    expect(await headOf(root)).toEqual({ unavailable: `not a small file: ${head}` })
  })

  const NO_REF = () => 'HEAD names no ref'
  const head = (text: string) => async (git: string) => {
    await writeFile(join(git, 'HEAD'), text)
    return NO_REF()
  }
  it.each<[string, (git: string) => Promise<string>]>([
    [
      'a HEAD that is a link',
      async git => {
        await rm(join(git, 'HEAD'))
        await symlink(join(git, 'refs', 'heads', 'main'), join(git, 'HEAD'))
        return 'ELOOP'
      },
    ],
    [
      'a HEAD that is a directory',
      async git => {
        await rm(join(git, 'HEAD'))
        await mkdir(join(git, 'HEAD'))
        return `not a small file: ${join(git, 'HEAD')}`
      },
    ],
    [
      'a HEAD that is a pipe nobody writes to',
      async git => {
        await rm(join(git, 'HEAD'))
        execFileSync('mkfifo', [join(git, 'HEAD')])
        return `not a small file: ${join(git, 'HEAD')}`
      },
    ],
    ['a HEAD that names no ref', head('main\n')],
    ['a HEAD that names a path out of the refs', head('ref: refs/../../outside\n')],
    ['a HEAD that names a hidden part', head('ref: refs/heads/.main\n')],
    ['a HEAD that names something outside the refs', head('ref: objects/refs/heads/main\n')],
    ['a HEAD with something before the ref', head('x ref: refs/heads/main\n')],
    ['a HEAD with something after the ref', head('ref: refs/heads/main and more\n')],
    ['a HEAD with something before the commit', head(`x${COMMIT}\n`)],
    ['a HEAD with something after the commit', head(`${COMMIT}0\n`)],
    [
      'a HEAD larger than a HEAD is',
      async git => {
        await writeFile(join(git, 'HEAD'), `ref: refs/heads/${'x'.repeat(5000)}\n`)
        return `not a small file: ${join(git, 'HEAD')}`
      },
    ],
    [
      'refs that name each other without end',
      async git => {
        await writeFile(join(git, 'refs', 'heads', 'main'), 'ref: refs/heads/main\n')
        return 'HEAD follows too many refs'
      },
    ],
    [
      'a ref reached through a link that leads out of the repository',
      async git => {
        await mkdir(join(box.root, 'elsewhere'), { recursive: true })
        await writeFile(join(box.root, 'elsewhere', 'main'), `${LATER}\n`)
        await rm(join(git, 'refs', 'heads'), { recursive: true })
        await symlink(join(box.root, 'elsewhere'), join(git, 'refs', 'heads'))
        return `outside the repository: ${join(git, 'refs', 'heads', 'main')}`
      },
    ],
    [
      'refs behind a link that leads nowhere but to itself',
      async git => {
        await rm(join(git, 'refs', 'heads'), { recursive: true })
        await symlink(join(git, 'refs', 'heads'), join(git, 'refs', 'heads'))
        return 'ELOOP'
      },
    ],
    [
      'a `.git` file that names no directory',
      async git => {
        await rm(git, { recursive: true })
        await writeFile(git, 'not a gitdir: pointer\n')
        return '.git is a file that names no directory'
      },
    ],
  ])('could not look, and says so instead of guessing: %s', async (_name, damage) => {
    const root = await repository(box.root, next())
    const unavailable = await damage(join(root, '.git'))
    expect(await readWorkingCopy(root)).toEqual({ unavailable })
  })

  it('could not look into a repository it may not enter, and says so with the error code', async () => {
    const root = await repository(box.root, next())
    await chmod(join(root, '.git'), 0o000)
    try {
      expect(await readWorkingCopy(root)).toEqual({ unavailable: 'EACCES' })
    } finally {
      await chmod(join(root, '.git'), 0o700)
    }
  })
})
