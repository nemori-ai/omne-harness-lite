import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { dependencySurface } from '../src/dependency-surface.ts'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function fixture(source: string) {
  const root = await mkdtemp(join(tmpdir(), 'dependency-require-'))
  directories.push(root)
  for (const path of ['src/generated', 'generated'])
    await mkdir(join(root, path), { recursive: true })
  await writeFile(join(root, 'package.json'), '{"type":"module"}')
  await writeFile(join(root, 'src/index.ts'), source)
  await writeFile(join(root, 'generated/start.cjs'), "module.exports = require('./child.cjs')")
  await writeFile(join(root, 'generated/child.cjs'), 'module.exports = { actual: true }')
  await writeFile(join(root, 'src/generated/start.cjs'), "require('wrong-source-relative-edge')")
  return root
}

it('follows the real package-based native graph and its CommonJS child', async () => {
  const root = await fixture(`
    import { createRequire } from 'node:module'
    const require = createRequire(new URL('../package.json', import.meta.url))
    const value = require('./generated/start.cjs')
  `)
  const native = createRequire(join(root, 'package.json'))
  expect(native('./generated/start.cjs')).toEqual({ actual: true })
  const result = await dependencySurface(join(root, 'src/index.ts'))
  expect(result.files.map(file => file.file)).toEqual([
    join(root, 'generated/child.cjs'),
    native.resolve('./generated/start.cjs'),
    join(root, 'src/index.ts'),
  ])
  expect(result.external).toEqual(['node:module'])
})

it('uses each lexical require binding instead of one origin for the whole file', async () => {
  const root = await fixture(`
    import { createRequire as nativeRequire } from 'node:module'
    const require = nativeRequire(new URL('../package.json', import.meta.url))
    require('./generated/start.cjs')
    function local() {
      const require = nativeRequire(import.meta.url)
      require('./generated/start.cjs')
    }
  `)
  const result = await dependencySurface(join(root, 'src/index.ts'))
  expect(result.files.map(file => file.file)).toContain(join(root, 'src/generated/start.cjs'))
  expect(result.files.map(file => file.file)).toContain(join(root, 'generated/start.cjs'))
  expect(result.external).toEqual(['node:module', 'wrong-source-relative-edge'])
})

it('rejects a computed native origin instead of falling back to the source directory', async () => {
  const root = await fixture(`
    import { createRequire } from 'node:module'
    const require = createRequire(origin)
    require('./generated/start.cjs')
  `)
  await expect(dependencySurface(join(root, 'src/index.ts'))).rejects.toThrow(
    /unsupported createRequire origin/,
  )
})

it('rejects a shadowing parameter even when an outer static require exists', async () => {
  const root = await fixture(`
    import { createRequire } from 'node:module'
    const require = createRequire(new URL('../package.json', import.meta.url))
    function local(require: (name: string) => unknown) {
      require('./generated/start.cjs')
    }
  `)
  await expect(dependencySurface(join(root, 'src/index.ts'))).rejects.toThrow(
    /unsupported require binding/,
  )
})
