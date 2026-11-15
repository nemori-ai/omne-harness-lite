import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const common = [
  'rule-codec.ts',
  'protocol.ts',
  'access-protocol.ts',
  'outcome.ts',
  'identity-text.ts',
  'rule.ts',
  'leaf-codec.ts',
] as const

function localImports(file: string): readonly string[] {
  const text = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
  const specifiers = [
    ...text.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g),
    ...text.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
    ...text.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm),
  ].map(match => match[1] ?? '')
  return specifiers.filter(specifier => specifier.startsWith('.'))
}

it.each(common)('%s imports only the other common files', file => {
  const outside = localImports(file).filter(
    specifier => !common.some(name => specifier === `./${name}`),
  )
  expect(outside).toEqual([])
})

it('reads relative imports in every form the sources use', () => {
  expect(localImports('rule-codec.ts')).toEqual([
    './identity-text.ts',
    './leaf-codec.ts',
    './rule.ts',
  ])
})
