// @module-tag source-text
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { expect, it } from 'vitest'

const group = join(import.meta.dirname, '../..')

function sourcesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourcesUnder(path)
    return /\.(ts|tsx)$/u.test(name) ? [path] : []
  })
}

const members = readdirSync(group).filter(name =>
  statSync(join(group, name, 'src'), { throwIfNoEntry: false })?.isDirectory(),
)
const files = members.flatMap(member => sourcesUnder(join(group, member, 'src')))

/** The code alone: what a comment says is not a value the code uses. */
const codeOf = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '')

/** A whole literal that is a point name of another domain: <host>.<name>, with a host that is not plugin and no file suffix. */
const NAME = /['"`]([a-z][a-z0-9-]*)\.([a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*)['"`]/gu
const FILE = /\.(js|json|md|ts|tsx|css|png|svg|jpg|webp|avif|html)$/u

it('PL-I26: the sources of plugin name no point of another domain; only the points of plugin itself', () => {
  const named = files.flatMap(path => {
    const where = relative(group, path)
    return [...codeOf(readFileSync(path, 'utf8')).matchAll(NAME)]
      .filter(
        ([whole, host]) =>
          host !== 'plugin' && !host?.startsWith('plugin-') && !FILE.test(whole.slice(1, -1)),
      )
      .map(([whole]) => `${where} ${whole}`)
  })
  // A point name can come in as a constant from the package that owns it, too.
  const imported = files.flatMap(path =>
    [
      ...readFileSync(path, 'utf8').matchAll(
        /import[^;]*?\{([^}]*)\}\s*from\s*'@omne-harness\/(?!plugin)[^']+'/gu,
      ),
    ].flatMap(([, names]) =>
      (names ?? '')
        .split(',')
        .map(name => name.trim().replace(/^type\s+/u, ''))
        .filter(name => /_POINTS?$/u.test(name))
        .map(name => `${relative(group, path)} ${name}`),
    ),
  )
  expect(imported).toEqual([])
  expect(files.length).toBeGreaterThan(40)
  expect(named).toEqual([])
})
