import { rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DirectoryType } from '@omne-harness/workspace-filesystem'
import { GitType, type GitMaterial } from '@omne-harness/workspace-git'
import { COMMIT, LATER, linked, plain, repository, sandbox } from './repositories.ts'

let box: Awaited<ReturnType<typeof sandbox>>
let count = 0
const next = () => `copy-${++count}`
beforeAll(async () => {
  box = await sandbox()
})
afterAll(async () => {
  await box.dispose()
})

const git = new GitType()
const OTHER = { kind: 'refused', reason: 'not-the-same-resource' }

async function recognised(root: string) {
  const answer = await git.recognise(root)
  if (!('ok' in answer)) throw new Error(JSON.stringify(answer))
  return answer.ok
}

describe('the Git type is the directory type and something more', () => {
  it('is named git and extends directory', () => {
    expect([git.name, git.extends]).toEqual(['git', 'directory'])
    expect(git).toBeInstanceOf(DirectoryType)
  })

  it('recognises a working copy: the material of its directory, and the repository beside it', async () => {
    const root = await repository(box.root, next())
    const base = await new DirectoryType().recognise(root)
    if (!('ok' in base)) throw new Error('the directory type did not take it')
    const found = await recognised(root)
    expect(found.occupancy).toBe(root)
    expect(found.material).toEqual({
      ...(base.ok.material as object),
      repository: { commonDirectory: join(root, '.git'), identity: expect.any(String) },
    })
  })

  it('asks the directory type first: what that refuses, this refuses for the same reason', async () => {
    const root = await repository(box.root, next())
    expect(await git.recognise('relative/path')).toEqual({ refused: 'not-an-absolute-path' })
    expect(await git.recognise(join(root, 'README.md'))).toEqual({ refused: 'not-a-directory' })
    expect(await git.recognise(join(box.root, 'missing'))).toEqual({ refused: 'not-found' })
  })

  it('does not recognise a directory that is no working copy, a subdirectory of one, or one in an unsupported format', async () => {
    const root = await repository(box.root, next())
    const no = { refused: 'not-a-working-copy' }
    expect(await git.recognise(await plain(box.root, next()))).toEqual(no)
    expect(await git.recognise(join(root, 'src'))).toEqual(no)
    await writeFile(join(root, '.git', 'HEAD'), 'garbage\n')
    expect(await git.recognise(root)).toEqual({ unavailable: expect.any(String) })
  })
})

describe('another working copy of the same repository is the same resource', () => {
  it('admits the first instance, a linked working copy, and nothing of another repository', async () => {
    const main = await recognised(await repository(box.root, next()))
    const copy = await recognised(await linked(main.occupancy, box.root, next()))
    const stranger = await recognised(await repository(box.root, next()))
    expect(git.admits([], main)).toEqual({ kind: 'admitted' })
    expect(git.admits([main.material], copy)).toEqual({ kind: 'admitted' })
    expect(git.admits([main.material, copy.material], copy)).toEqual({ kind: 'admitted' })
    expect(git.admits([main.material], stranger)).toEqual(OTHER)
    expect(git.admits([main.material, stranger.material], copy)).toEqual(OTHER)
  })

  it('does not admit a candidate or beside an instance whose material names no repository', async () => {
    const main = await recognised(await repository(box.root, next()))
    const directory = await new DirectoryType().recognise(await plain(box.root, next()))
    if (!('ok' in directory)) throw new Error('the directory type did not take it')
    expect(git.admits([main.material], directory.ok)).toEqual(OTHER)
    expect(git.admits([], directory.ok)).toEqual(OTHER)
    expect(git.admits([directory.ok.material], main)).toEqual(OTHER)
    const { repository: known } = main.material as GitMaterial
    for (const repository of [
      { ...known, identity: '0:0' },
      { ...known, commonDirectory: '/elsewhere/.git' },
      { identity: known.identity },
      null,
    ])
      expect(
        git.admits([main.material], {
          ...main,
          material: { ...(main.material as object), repository } as never,
        }),
      ).toEqual(OTHER)
  })
})

describe('a look at a Git instance', () => {
  it('gives the directory and the commit it is at now', async () => {
    const root = await repository(box.root, next())
    const { material } = await recognised(root)
    expect(await git.inspect(material)).toEqual({ ok: { directory: root, basis: COMMIT } })
    await writeFile(join(root, '.git', 'refs', 'heads', 'main'), `${LATER}\n`)
    expect(await git.inspect(material)).toEqual({ ok: { directory: root, basis: LATER } })
    await rm(join(root, '.git', 'refs', 'heads', 'main'))
    expect(await git.inspect(material)).toEqual({
      ok: { directory: root, basis: 'unborn:refs/heads/main' },
    })
  })

  it('asks the directory type first: a directory that is gone or replaced is refused as a directory is', async () => {
    const root = await repository(box.root, next())
    const { material } = await recognised(root)
    await rename(root, `${root}.away`)
    expect(await git.inspect(material)).toEqual({ refused: 'not-found' })
    await repository(box.root, root.split('/').pop()!)
    expect(await git.inspect(material)).toEqual({ refused: 'replaced' })
  })

  it('the same directory with another repository in it is another resource', async () => {
    const root = await repository(box.root, next())
    const { material } = await recognised(root)
    await rename(join(root, '.git'), join(root, '.git.old'))
    expect(await git.inspect(material)).toEqual({ refused: 'not-a-working-copy' })
    const other = await repository(box.root, next())
    await rename(join(other, '.git'), join(root, '.git'))
    expect(await git.inspect(material)).toEqual({ refused: 'replaced' })
  })

  it('cannot look at material that names no repository or no directory', async () => {
    const { material } = await recognised(await repository(box.root, next()))
    const { repository: _repository, ...directory } = material as GitMaterial
    expect(await git.inspect(directory)).toEqual({ refused: 'replaced' })
    expect(await git.inspect({ repository: _repository })).toEqual({ unavailable: 'material' })
  })
})
