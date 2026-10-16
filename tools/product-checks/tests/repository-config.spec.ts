import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { collectRepositorySources } from '../src/repository.ts'

let root: string | undefined
afterEach(() => {
  if (root !== undefined) rmSync(root, { recursive: true, force: true })
  root = undefined
})

/** 根 tsconfig 只写 extends；别名在被继承的那份配置里。 */
function repository(base: string): string {
  root = mkdtempSync(join(tmpdir(), 'omne-repository-config-'))
  mkdirSync(join(root, 'packages/a/b/src'), { recursive: true })
  writeFileSync(join(root, 'packages/a/b/src/target.ts'), 'export const value = 1\n')
  writeFileSync(join(root, 'packages/a/b/src/user.ts'), "import { value } from '@alias'\n")
  writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ extends: base }))
  return root
}

function preset(repo: string, directory: string): void {
  mkdirSync(directory, { recursive: true })
  writeFileSync(
    join(directory, 'preset.json'),
    JSON.stringify({
      compilerOptions: {
        baseUrl: repo,
        paths: { '@alias': ['packages/a/b/src/target.ts'] },
      },
    }),
  )
}

test('a package-name extends resolves from node_modules next to the configuration', () => {
  const repo = repository('@scope/preset/preset.json')
  const installed = join(repo, 'node_modules/@scope/preset')
  preset(repo, installed)
  writeFileSync(
    join(installed, 'package.json'),
    JSON.stringify({ name: '@scope/preset', exports: { './preset.json': './preset.json' } }),
  )
  const user = collectRepositorySources(repo).find(file => file.path === 'packages/a/b/src/user.ts')
  expect(user?.resolvedModules?.['@alias']).toBe('packages/a/b/src/target.ts')
})

test('a relative extends still resolves as a file', () => {
  const repo = repository('./config/preset.json')
  preset(repo, join(repo, 'config'))
  const user = collectRepositorySources(repo).find(file => file.path === 'packages/a/b/src/user.ts')
  expect(user?.resolvedModules?.['@alias']).toBe('packages/a/b/src/target.ts')
})

test('a package-name extends that is not installed stops the guard', () => {
  const repo = repository('@scope/missing/preset.json')
  expect(() => collectRepositorySources(repo)).toThrow(
    'repository guard cannot resolve the compiler configuration base @scope/missing/preset.json from tsconfig.json',
  )
})
