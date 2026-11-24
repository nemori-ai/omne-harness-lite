import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '../../src')

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory()
      ? sources(join(dir, entry.name))
      : entry.name.endsWith('.ts')
        ? [join(dir, entry.name)]
        : [],
  )
}

it('the system time source is built in one place, the entry, and no row reads the host clock on its own', () => {
  const builders = sources(SRC)
    .filter(file => readFileSync(file, 'utf8').includes('systemTime()'))
    .map(file => relative(SRC, file))
  expect(builders).toEqual(['entry/time.ts'])
  const simulated = sources(SRC)
    .filter(file => readFileSync(file, 'utf8').includes('readSystemInstant'))
    .map(file => relative(SRC, file))
  expect(simulated).toEqual([])
})
