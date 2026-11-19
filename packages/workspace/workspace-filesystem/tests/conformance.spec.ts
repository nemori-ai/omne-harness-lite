// @module-tag slow
// Runs the rules every management type obeys against real directories.
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { typeConformanceCases, type TypeHarness } from '@omne-harness/workspace/testing'
import { DirectoryType } from '@omne-harness/workspace-filesystem'
import { digestOf, mkdir, project, rename, sandbox, symlink, writeFile } from './directories.ts'

let box: Awaited<ReturnType<typeof sandbox>>
let count = 0
const next = () => `project-${++count}`

beforeAll(async () => {
  box = await sandbox()
})
afterAll(async () => {
  await box.dispose()
})

function harness(): TypeHarness {
  const type = new DirectoryType()
  return {
    types: [type],
    subject: type.name,
    fresh: () => project(box.root, next()),
    // Nothing makes a second directory a copy of the first.
    copy: async () => null,
    async illegal() {
      const real = await project(box.root, next())
      const link = join(box.root, next())
      await symlink(real, link)
      const file = join(real, 'README.md')
      const through = join(box.root, next())
      await symlink(box.root, through)
      return [
        'relative/path',
        join(box.root, 'missing'),
        file,
        link,
        join(through, real.split('/').pop()!),
      ]
    },
    // Every legal address is a directory, and this type recognises every directory.
    unrecognised: async () => null,
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
    blind: async () => false,
    advance: async () => false,
    expected: async address => ({ directory: address, basis: 'unpinned' }),
    digest: digestOf,
  }
}

describe('the filesystem type obeys the rules of every management type', () => {
  it.each(typeConformanceCases)('$name', async conformance => {
    await expect(conformance.run(harness())).resolves.toBeUndefined()
  })
})
