import { existsSync, readdirSync, readFileSync } from 'node:fs'
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

const PACKAGES = join(import.meta.dirname, '..', '..', '..', 'packages')

function membersOutside(groups: readonly string[]): ReadonlySet<string> {
  return new Set(
    readdirSync(PACKAGES, { withFileTypes: true })
      .filter(group => group.isDirectory() && !groups.includes(group.name))
      .flatMap(group =>
        readdirSync(join(PACKAGES, group.name), { withFileTypes: true })
          .map(member => join(PACKAGES, group.name, member.name, 'package.json'))
          .filter(manifest => existsSync(manifest))
          .map(manifest => JSON.parse(readFileSync(manifest, 'utf8')).name as string),
      ),
  )
}

const OUTSIDE_SHELL = membersOutside(['frontend', 'access'])
const DOMAIN_MEMBERS = membersOutside(['frontend', 'access', 'common', 'util'])

const memberOf = (specifier: string): string =>
  specifier
    .split('/')
    .slice(0, specifier.startsWith('@') ? 2 : 1)
    .join('/')

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

  it('外壳不导入任何领域的成员，也不导入装配文件', () => {
    const bad = (specifier: string) =>
      OUTSIDE_SHELL.has(memberOf(specifier)) || /(^|\/)assembly\.tsx?$/.test(specifier)
    expect(offending('page/shell', bad)).toEqual([])
  })

  it('页面里只有装配文件点名领域的成员', () => {
    const naming = files(join(SRC, 'page'))
      .filter(file => imports(file).some(specifier => DOMAIN_MEMBERS.has(memberOf(specifier))))
      .map(file => relative(SRC, file))
    expect(naming).toEqual(['page/assembly.tsx'])
  })

  it('装配文件列出五个界面模块', () => {
    const modules = imports(join(SRC, 'page', 'assembly.tsx'))
      .filter(specifier => specifier.endsWith('-ui/cordis'))
      .sort()
    expect(modules).toEqual([
      '@omne-harness/assets-ui/cordis',
      '@omne-harness/human-intervention-ui/cordis',
      '@omne-harness/identity-ui/cordis',
      '@omne-harness/session-ui/cordis',
      '@omne-harness/tool-ui/cordis',
    ])
    expect(modules.every(specifier => DOMAIN_MEMBERS.has(memberOf(specifier)))).toBe(true)
  })

  it('领域成员的名单读得到', () => {
    expect(DOMAIN_MEMBERS.has('@omne-harness/session-ui')).toBe(true)
    expect(DOMAIN_MEMBERS.has('@omne-harness/identity-protocol')).toBe(true)
    expect(DOMAIN_MEMBERS.has('@omne-harness/shell-contract')).toBe(false)
    expect(DOMAIN_MEMBERS.has('@omne-harness/client-assembly')).toBe(false)
    expect(DOMAIN_MEMBERS.has('@omne-harness/json-text')).toBe(false)
    expect(OUTSIDE_SHELL.has('@omne-harness/json-text')).toBe(true)
    expect(OUTSIDE_SHELL.has('@omne-harness/ui-kit')).toBe(false)
  })
})
