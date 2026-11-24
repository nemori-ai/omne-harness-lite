import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const src = join(import.meta.dirname, '..', 'src')

it('imports only Cordis, React types, the two Dynamis members and itself', () => {
  const imports = readdirSync(src).flatMap(file =>
    [...readFileSync(join(src, file), 'utf8').matchAll(/from '([^']+)'/g)].map(match => match[1]),
  )
  const outside = imports.filter(name => !name!.startsWith('./'))
  expect(new Set(outside)).toEqual(
    new Set([
      'react',
      '@deepseek-ai/cordis',
      '@omne-harness/dynamis',
      '@omne-harness/dynamis-cordis/cordis',
    ]),
  )
})
