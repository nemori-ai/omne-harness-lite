import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const src = join(import.meta.dirname, '..', 'src')

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
  )
}

const sources = files(src).map(file => ({ file, text: readFileSync(file, 'utf8') }))
const code = sources.filter(source => /\.tsx?$/.test(source.file))
const styles = sources.filter(source => source.file.endsWith('.css'))

it('S1 the member draws no base controls of its own: no native button, input, select or textarea', () => {
  for (const { file, text } of code)
    expect(text, file).not.toMatch(/<(button|input|select|textarea)[\s>]/)
})

it('S2 the member styles are layout only: no custom property, no --pe- anywhere', () => {
  for (const { file, text } of sources) expect(text, file).not.toContain('--pe-')
  for (const { file, text } of styles) expect(text, file).not.toMatch(/^\s*--[\w-]+\s*:/m)
})

it('S3 the member imports only what its boundary allows and no Node built-in', () => {
  const allowed = new Set([
    'react',
    '@omne-harness/assets-protocol',
    '@omne-harness/client-assembly/cordis',
    '@omne-harness/json-text',
    '@omne-harness/public-contract',
    '@omne-harness/sdk/core',
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
})

it('S4 the member names no asset category: neither a quoted identifier nor a Chinese name', () => {
  for (const { file, text } of code) {
    expect(text, file).not.toMatch(/['"`](tool|model|model-provider|skill|agent|mcp)['"`]/)
    expect(text, file).not.toMatch(/\b(tool|model|skill|agent|mcp)\s*:/)
    expect(text, file).not.toMatch(/工具|模型|技能|智能体|MCP/)
  }
})
