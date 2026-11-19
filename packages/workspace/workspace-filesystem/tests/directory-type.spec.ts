// @module-tag slow
// Real directories, links and renames on the filesystem.
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DirectoryType } from '@omne-harness/workspace-filesystem'
import { digestOf, mkdir, project, rename, rm, sandbox, symlink, writeFile } from './directories.ts'

let box: Awaited<ReturnType<typeof sandbox>>
const type = new DirectoryType()

beforeEach(async () => {
  box = await sandbox()
})
afterEach(async () => {
  await box.dispose()
})

describe('recognising a directory', () => {
  it('takes an existing directory given by its real path and reads nothing inside it', async () => {
    const root = await project(box.root, 'blog')
    const before = await digestOf(root)
    const answer = await type.recognise(root)
    expect(answer).toMatchObject({ ok: { occupancy: root, material: { scope: { root } } } })
    expect(await digestOf(root)).toBe(before)
  })

  it.each([
    ['a relative path', () => 'blog'],
    ['a path with a parent step', () => join(box.root, 'blog', 'src') + '/..'],
    ['a path with a trailing separator', () => join(box.root, 'blog') + '/'],
  ])('%s is not an absolute path', async (_name, address) => {
    await project(box.root, 'blog')
    expect(await type.recognise(address())).toEqual({ refused: 'not-an-absolute-path' })
  })

  it('a path that is not there, or runs through a file, is not found', async () => {
    const root = await project(box.root, 'blog')
    expect(await type.recognise(join(box.root, 'missing'))).toEqual({ refused: 'not-found' })
    expect(await type.recognise(join(root, 'README.md', 'below'))).toEqual({ refused: 'not-found' })
  })

  it('a file is not a directory', async () => {
    const root = await project(box.root, 'blog')
    expect(await type.recognise(join(root, 'README.md'))).toEqual({ refused: 'not-a-directory' })
  })

  it('a link to a directory is not the directory', async () => {
    const root = await project(box.root, 'blog')
    await symlink(root, join(box.root, 'link'))
    expect(await type.recognise(join(box.root, 'link'))).toEqual({ refused: 'not-a-directory' })
  })

  it('a path that reaches the directory through a link is not its real path', async () => {
    await project(join(box.root, 'real'), 'blog')
    await symlink(join(box.root, 'real'), join(box.root, 'alias'))
    expect(await type.recognise(join(box.root, 'alias', 'blog'))).toEqual({
      refused: 'not-the-real-path',
    })
  })

  it('two directories are two positions, a directory and one inside it too', async () => {
    const outer = await project(box.root, 'outer')
    const answers = await Promise.all([outer, join(outer, 'src')].map(path => type.recognise(path)))
    expect(answers.map(answer => 'ok' in answer && answer.ok.occupancy)).toEqual([
      outer,
      join(outer, 'src'),
    ])
  })
})

describe('admitting a second instance', () => {
  it('admits the first and refuses every other: nothing says two directories are one resource', async () => {
    const one = await type.recognise(await project(box.root, 'one'))
    const two = await type.recognise(await project(box.root, 'two'))
    if (!('ok' in one) || !('ok' in two)) throw new Error('not recognised')
    expect(type.admits([], one.ok)).toEqual({ kind: 'admitted' })
    expect(type.admits([one.ok.material], two.ok)).toEqual({
      kind: 'refused',
      reason: 'not-the-same-resource',
    })
    expect(type.admits([one.ok.material], one.ok).kind).toBe('refused')
  })
})

describe('inspecting what was recognised', () => {
  async function recognised(name: string) {
    const root = await project(box.root, name)
    const answer = await type.recognise(root)
    if (!('ok' in answer)) throw new Error('not recognised')
    return { root, material: answer.ok.material }
  }

  it('gives the root and the basis of a resource without versions', async () => {
    const { root, material } = await recognised('blog')
    await writeFile(join(root, 'new.txt'), 'the content may change; it has no version')
    expect(await type.inspect(material)).toEqual({ ok: { directory: root, basis: 'unpinned' } })
  })

  it('a directory that was moved away is not found, and is itself again when it is back', async () => {
    const { root, material } = await recognised('blog')
    await rename(root, join(box.root, 'elsewhere'))
    expect(await type.inspect(material)).toEqual({ refused: 'not-found' })
    await rename(join(box.root, 'elsewhere'), root)
    expect(await type.inspect(material)).toMatchObject({ ok: { directory: root } })
  })

  it('another directory under the same name is not followed', async () => {
    const { root, material } = await recognised('blog')
    await rename(root, join(box.root, 'elsewhere'))
    await mkdir(root)
    expect(await type.inspect(material)).toEqual({ refused: 'replaced' })
  })

  it('a file or a link under the same name is not the directory', async () => {
    const { root, material } = await recognised('blog')
    await rm(root, { recursive: true })
    await writeFile(root, 'a file now')
    expect(await type.inspect(material)).toEqual({ refused: 'not-a-directory' })
    await rm(root)
    await symlink(await project(box.root, 'target'), root)
    expect(await type.inspect(material)).toEqual({ refused: 'not-a-directory' })
  })

  it('a parent that became a link makes the stored path no longer the real path', async () => {
    const parent = join(box.root, 'parent')
    const root = await project(parent, 'blog')
    const answer = await type.recognise(root)
    if (!('ok' in answer)) throw new Error('not recognised')
    await rename(parent, join(box.root, 'moved'))
    await symlink(join(box.root, 'moved'), parent)
    expect(await type.inspect(answer.ok.material)).toEqual({ refused: 'not-the-real-path' })
  })

  it.each([
    [null],
    ['text'],
    [[]],
    [{ scope: null, rootIdentity: 'x' }],
    [{ scope: { root: 7 }, rootIdentity: 'x' }],
    [{ scope: { root: '/a' } }],
  ])("material that is not this type's (%j) cannot be looked at", async material => {
    expect(await type.inspect(material)).toEqual({ unavailable: 'material' })
  })
})
