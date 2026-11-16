import { readdirSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { join, relative } from 'node:path'
import { expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', 'src')

const ALLOWED = [
  '@deepseek-ai/cordis',
  '@omne-harness/client-assembly',
  '@omne-harness/identity-protocol',
  '@omne-harness/legal-identity',
  '@omne-harness/sdk',
  '@omne-harness/shell-contract',
  '@omne-harness/ui-kit',
  'react',
]

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory()
      ? files(join(directory, entry.name))
      : /\.tsx?$/.test(entry.name)
        ? [join(directory, entry.name)]
        : [],
  )
}

const imports = (file: string): string[] =>
  [...readFileSync(file, 'utf8').matchAll(/from '([^']+)'/g)].map(match => match[1]!)

const memberOf = (specifier: string): string =>
  specifier
    .split('/')
    .slice(0, specifier.startsWith('@') ? 2 : 1)
    .join('/')

it('源码只导入客户端装配、frontend 组、SDK、身份的协议契约、共用纯定义、Cordis 与 React，不导入 Node 内置', () => {
  const node = new Set(builtinModules.flatMap(name => [name, `node:${name}`]))
  const outside = files(SRC).flatMap(file =>
    imports(file)
      .filter(specifier => !specifier.startsWith('.'))
      .filter(specifier => node.has(specifier) || !ALLOWED.includes(memberOf(specifier)))
      .map(specifier => `${relative(SRC, file)} -> ${specifier}`),
  )
  expect(outside).toEqual([])
})

it('从 SDK 只取客户端核心', () => {
  const sdk = files(SRC).flatMap(file =>
    imports(file).filter(specifier => specifier.startsWith('@omne-harness/sdk')),
  )
  expect(new Set(sdk)).toEqual(new Set(['@omne-harness/sdk/core']))
})
