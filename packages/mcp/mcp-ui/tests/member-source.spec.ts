import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const member = join(import.meta.dirname, '..')

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
  )
}

const code = files(join(member, 'src')).map(file => ({ file, text: readFileSync(file, 'utf8') }))

it('S1 the member draws no base controls of its own: no native button, input, select or textarea', () => {
  for (const { file, text } of code)
    expect(text, file).not.toMatch(/<(button|input|select|textarea)[\s>]/)
})

it('S3 the member styles are layout only: no custom property of its own', () => {
  const styles = code.filter(({ file }) => file.endsWith('.css'))
  expect(styles).toHaveLength(1)
  for (const { file, text } of styles) expect(text, file).not.toMatch(/^\s*--[\w-]+\s*:/m)
})

it('S2 the member imports only the frontend group and React: no asset member, no protocol', () => {
  const allowed = new Set([
    'react',
    '@omne-harness/shell-contract',
    '@omne-harness/shell-contract/cordis',
    '@omne-harness/ui-kit',
  ])
  const imports = code.flatMap(({ text }) =>
    [...text.matchAll(/(?:from|import)\s+'([^']+)'/g)]
      .map(match => match[1]!)
      .filter(name => !name.startsWith('.')),
  )
  expect(imports.filter(name => !allowed.has(name))).toEqual([])
  const manifest = JSON.parse(readFileSync(join(member, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>
  }
  expect(Object.keys(manifest.dependencies).sort()).toEqual([
    '@omne-harness/shell-contract',
    '@omne-harness/ui-kit',
    'react',
    'react-dom',
  ])
})
