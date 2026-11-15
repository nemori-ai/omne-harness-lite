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
  return [...text.matchAll(/(?:^|\n)\s*(?:import|export)(?:[^'"]*?from)?\s*'([^']+)'/g)].map(
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
      NODE.has(specifier) ||
      specifier === 'electron' ||
      /(^|\/)(main-core|web-host|electron-host)(\/|$)/.test(specifier)
    expect([...offending('page', bad), ...offending('shared', bad)]).toEqual([])
  })

  it('宿主一侧不导入页面', () => {
    const bad = (specifier: string) => /(^|\/)page(\/|$)/.test(specifier)
    expect([
      ...offending('main-core', bad),
      ...offending('web-host', bad),
      ...offending('electron-host', bad),
    ]).toEqual([])
  })

  it('预加载只导入 electron 与共享类型，不导入宿主核心或主进程一侧', () => {
    const preload = join(SRC, 'electron-host', 'preload.ts')
    const bad = (specifier: string) =>
      specifier !== 'electron' && !specifier.startsWith('../shared/')
    expect(imports(preload).filter(bad)).toEqual([])
  })

  it('主进程一侧的桥不导入 electron，换成替身就能测', () => {
    const bridge = join(SRC, 'electron-host', 'ipc-host.ts')
    expect(imports(bridge).filter(specifier => specifier === 'electron')).toEqual([])
  })

  it('外壳不导入任何领域', () => {
    const bad = (specifier: string) =>
      /identity|session|(^|\/)assembly/.test(specifier) && !specifier.includes('client-assembly')
    expect(offending('page/shell', bad)).toEqual([])
  })
})
