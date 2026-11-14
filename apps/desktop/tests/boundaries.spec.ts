import { readdirSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', 'src')

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory()
      ? files(join(directory, entry.name))
      : /\.tsx?$/.test(entry.name)
        ? [join(directory, entry.name)]
        : [],
  )
}

function imports(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  return [...text.matchAll(/(?:^|\n)\s*(?:import|export)[^'"]*?from\s+'([^']+)'/g)].map(
    match => match[1]!,
  )
}

const NODE = new Set(builtinModules.flatMap(name => [name, `node:${name}`]))

function offending(directory: string, bad: (specifier: string) => boolean): string[] {
  return files(join(SRC, directory)).flatMap(file =>
    imports(file)
      .filter(bad)
      .map(specifier => `${relative(SRC, file)} -> ${specifier}`),
  )
}

describe('边界', () => {
  it('页面与共享类型不导入宿主一侧，也不导入 Node 内置', () => {
    const bad = (specifier: string) =>
      NODE.has(specifier) || /(^|\/)(main-core|web-host)(\/|$)/.test(specifier)
    expect([...offending('page', bad), ...offending('shared', bad)]).toEqual([])
  })

  it('宿主一侧不导入页面', () => {
    const bad = (specifier: string) => /(^|\/)page(\/|$)/.test(specifier)
    expect([...offending('main-core', bad), ...offending('web-host', bad)]).toEqual([])
  })

  it('外壳不导入任何领域', () => {
    const bad = (specifier: string) =>
      /identity|session|(^|\/)assembly/.test(specifier) && !specifier.includes('client-assembly')
    expect(offending('page/shell', bad)).toEqual([])
  })
})
