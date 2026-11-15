import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const src = join(import.meta.dirname, '..', 'src')

it('imports no domain member, only Cordis, React types, client assembly and itself', () => {
  const imports = readdirSync(src).flatMap(file =>
    [...readFileSync(join(src, file), 'utf8').matchAll(/from '([^']+)'/g)].map(match => match[1]),
  )
  const outside = imports.filter(name => !name!.startsWith('./'))
  expect(new Set(outside)).toEqual(
    new Set(['react', '@deepseek-ai/cordis', '@omne-harness/client-assembly/cordis']),
  )
})
