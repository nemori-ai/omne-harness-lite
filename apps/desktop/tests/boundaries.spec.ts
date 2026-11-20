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

const OUTSIDE_PAGE = ['forwarding', 'standalone', 'main', 'utility', 'port-fetch']

describe('边界', () => {
  it('页面与共享类型不导入页面之外的那一半，也不导入 Node 内置与 electron', () => {
    const bad = (specifier: string) =>
      NODE.has(specifier) ||
      specifier === 'electron' ||
      new RegExp(`(^|/)(${OUTSIDE_PAGE.join('|')})(/|$)`).test(specifier)
    expect([...offending('page', bad), ...offending('shared', bad)]).toEqual([])
  })

  it('页面之外的那一半不导入页面', () => {
    const bad = (specifier: string) => /(^|\/)page(\/|$)/.test(specifier)
    expect(OUTSIDE_PAGE.flatMap(directory => offending(directory, bad))).toEqual([])
  })

  it('转发层不导入 electron、Node 的 HTTP 模块与任何一种承载', () => {
    const bad = (specifier: string) =>
      specifier === 'electron' ||
      /^(node:)?https?$/.test(specifier) ||
      /(^|\/)(standalone|main|utility|port-fetch)(\/|$)/.test(specifier)
    expect(offending('forwarding', bad)).toEqual([])
  })

  it('进程间传输不导入 electron 与本应用别的部分', () => {
    const bad = (specifier: string) => specifier === 'electron' || specifier.startsWith('../')
    expect(offending('port-fetch', bad)).toEqual([])
  })

  it('主进程不做业务：不导入协议契约、转发层与 SDK', () => {
    const bad = (specifier: string) =>
      /(^|\/)forwarding(\/|$)/.test(specifier) ||
      /^@omne-harness\/(.*-protocol|public-contract|sdk)(\/|$)/.test(specifier) ||
      specifier.endsWith('shared/protocols.ts')
    expect(offending('main', bad)).toEqual([])
  })

  it('主进程里只有入口、窗口与 utility 进程的启动导入 electron，其余换成替身就能测', () => {
    const using = files(join(SRC, 'main'))
      .filter(file => imports(file).includes('electron'))
      .map(file => relative(join(SRC, 'main'), file))
      .toSorted()
    expect(using).toEqual(['main.ts', 'utility-process.ts', 'window.ts'])
  })

  it('没有预加载脚本，不用进程间通信承载页面的请求；桌面应用不启动独立转发进程', () => {
    for (const file of files(join(SRC, 'main'))) {
      const text = readFileSync(file, 'utf8')
      expect(text, relative(SRC, file)).not.toMatch(/ipcMain|ipcRenderer|contextBridge|preload/)
      expect(text, relative(SRC, file)).not.toMatch(/createServer|\.listen\(/)
    }
    const bad = (specifier: string) => /standalone\/(server|bin)\.ts$/.test(specifier)
    expect([...offending('main', bad), ...offending('utility', bad)]).toEqual([])
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

  it('装配文件列出十二个界面模块', () => {
    const modules = imports(join(SRC, 'page', 'assembly.tsx'))
      .filter(specifier => specifier.endsWith('-ui/cordis'))
      .sort()
    expect(modules).toEqual([
      '@omne-harness/assets-ui/cordis',
      '@omne-harness/calendar-ui/cordis',
      '@omne-harness/human-intervention-ui/cordis',
      '@omne-harness/identity-ui/cordis',
      '@omne-harness/mcp-ui/cordis',
      '@omne-harness/media-ui/cordis',
      '@omne-harness/model-ui/cordis',
      '@omne-harness/notification-ui/cordis',
      '@omne-harness/schedule-ui/cordis',
      '@omne-harness/session-ui/cordis',
      '@omne-harness/tool-ui/cordis',
      '@omne-harness/usage-ui/cordis',
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
