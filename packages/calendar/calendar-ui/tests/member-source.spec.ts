import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const member = join(import.meta.dirname, '..')
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
  )
const code = files(join(member, 'src')).map(file => ({ file, text: readFileSync(file, 'utf8') }))

it('S1 the member draws no base controls of its own: no native button, input, select or textarea', () => {
  for (const { file, text } of code)
    expect(text, file).not.toMatch(/<(button|input|select|textarea)[\s>]/)
})

it('S2 the member styles are layout only: one sheet, no custom property of its own', () => {
  const styles = code.filter(({ file }) => file.endsWith('.css'))
  expect(styles).toHaveLength(1)
  for (const { file, text } of styles) expect(text, file).not.toMatch(/^\s*--[\w-]+\s*:/m)
})

it('S3 the member reads only its own protocol, the client side of access and the frontend group', () => {
  const allowed = new Set([
    'react',
    '@omne-harness/calendar-protocol',
    '@omne-harness/client-assembly/cordis',
    '@omne-harness/public-contract',
    '@omne-harness/sdk/core',
    '@omne-harness/shell-contract/cordis',
    '@omne-harness/ui-kit',
  ])
  const imports = code.flatMap(({ text }) =>
    [...text.matchAll(/(?:from|import)\s+'([^']+)'/g)]
      .map(match => match[1]!)
      .filter(name => !name.startsWith('.')),
  )
  expect(imports.filter(name => !allowed.has(name))).toEqual([])
})
