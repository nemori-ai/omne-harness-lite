// @module-tag source-text
import { readdirSync, readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const ALLOWED = new Set([
  'node:fs',
  'node:fs/promises',
  'node:path',
  '@omne-harness/workspace-contract',
  '@omne-harness/workspace-filesystem',
])
const src = new URL('../src/', import.meta.url)

it('the source reads files and starts no program: every import is one of the few it needs', () => {
  const files = readdirSync(src).filter(name => name.endsWith('.ts'))
  expect(files.sort()).toEqual(['git-facts.ts', 'git-type.ts', 'index.ts'])
  for (const name of files) {
    const text = readFileSync(new URL(name, src), 'utf8')
    const specifiers = [...text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/gu)].map(
      match => match[1]!,
    )
    for (const specifier of specifiers)
      expect([name, specifier, specifier.startsWith('./') || ALLOWED.has(specifier)]).toEqual([
        name,
        specifier,
        true,
      ])
    expect([name, /\b(?:require|process\.binding|Deno|Bun)\b/u.test(text)]).toEqual([name, false])
  }
})
