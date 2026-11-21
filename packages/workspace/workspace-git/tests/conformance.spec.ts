import { mkdir, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { typeConformanceCases, type TypeHarness } from '@omne-harness/workspace/testing'
import { DirectoryType } from '@omne-harness/workspace-filesystem'
import { GitType } from '@omne-harness/workspace-git'
import { COMMIT, LATER, digestOf, linked, plain, repository, sandbox } from './repositories.ts'

let box: Awaited<ReturnType<typeof sandbox>>
let count = 0
const next = () => `project-${++count}`

beforeAll(async () => {
  box = await sandbox()
})
afterAll(async () => {
  await box.dispose()
})

/** The Git type as it is assembled: with the type it extends beside it. */
function harness(): TypeHarness {
  const type = new GitType()
  const heads = new Map<string, string>()
  return {
    types: [new DirectoryType(), type],
    subject: type.name,
    async fresh() {
      const root = await repository(box.root, next())
      heads.set(root, COMMIT)
      return root
    },
    async copy(of) {
      const root = await linked(of, box.root, next())
      heads.set(root, COMMIT)
      return root
    },
    async illegal() {
      const real = await repository(box.root, next())
      const link = join(box.root, next())
      await symlink(real, link)
      return ['relative/path', join(box.root, 'missing'), join(real, 'README.md'), link]
    },
    // A directory that is no working copy is not this type's to take.
    unrecognised: () => plain(box.root, next()),
    async remove(address) {
      const away = `${address}.away`
      await rename(address, away)
      return () => rename(away, address)
    },
    async replace(address) {
      await rename(address, `${address}.old`)
      await mkdir(address)
      await writeFile(join(address, 'README.md'), 'another project\n')
    },
    // Without its HEAD the directory is still there and is no longer a working copy at any commit.
    async blind(address) {
      await rm(join(address, '.git', 'HEAD'))
      return true
    },
    async advance(address) {
      await writeFile(join(address, '.git', 'refs', 'heads', 'main'), `${LATER}\n`)
      heads.set(address, LATER)
      return true
    },
    expected: async address => ({ directory: address, basis: heads.get(address) ?? COMMIT }),
    digest: digestOf,
  }
}

describe('the Git type obeys the rules of every management type', () => {
  it.each(typeConformanceCases)('$name', async conformance => {
    await expect(conformance.run(harness())).resolves.toBeUndefined()
  })
})
