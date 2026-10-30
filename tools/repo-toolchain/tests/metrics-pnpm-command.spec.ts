// 覆盖率层起 pnpm 的规则：Windows 上按 PATH 顺序找 pnpm.exe，或找旁边有 pnpm.cjs 的 pnpm.cmd。
// 只用临时目录造布局，不起真的 pnpm；平台、PATH 与 Node 的路径经参数注入，两个平台的规则都能在任何宿主上测。
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { pnpmCommand, type PnpmHost } from '../src/metrics/coverage.ts'

const NODE = 'C:\\Program Files\\nodejs\\node.exe'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-pnpm-command-')))
  roots.push(root)
  return root
}

function file(path: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, '')
}

/** 只装了 pnpm.exe（独立安装的布局）的目录。 */
function standalone(root: string, name: string): string {
  const directory = join(root, name)
  file(join(directory, 'pnpm.exe'))
  return directory
}

/** npm 全局安装的布局：pnpm.cmd 旁边有 node_modules/pnpm/bin/pnpm.cjs。 */
function npmGlobal(root: string, name: string): string {
  const directory = join(root, name)
  file(join(directory, 'pnpm.cmd'))
  file(join(directory, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'))
  return directory
}

/** 只有 pnpm.cmd，旁边没有 pnpm.cjs。 */
function cmdOnly(root: string, name: string): string {
  const directory = join(root, name)
  file(join(directory, 'pnpm.cmd'))
  return directory
}

function windows(...directories: string[]): PnpmHost {
  return { platform: 'win32', env: { PATH: directories.join(';') }, execPath: NODE }
}

/** 调用必须抛错，返回那个错误；没抛错就让测试失败。 */
function thrownBy(run: () => unknown): Error {
  try {
    run()
  } catch (error) {
    if (error instanceof Error) return error
    throw error
  }
  throw new Error('应当抛错，却正常返回')
}

describe('Windows 上起 pnpm', () => {
  it('只有 pnpm.exe：起它的完整路径，不经 Node', () => {
    const root = fixture()
    const exe = standalone(root, 'standalone')
    expect(pnpmCommand(windows(exe))).toEqual({ command: join(exe, 'pnpm.exe'), args: [] })
  })

  it('只有 npm 全局布局：用本进程的 Node 起旁边的 pnpm.cjs', () => {
    const root = fixture()
    const npm = npmGlobal(root, 'npm')
    expect(pnpmCommand(windows(npm))).toEqual({
      command: NODE,
      args: [join(npm, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')],
    })
  })

  it('两者都有，pnpm.exe 所在目录在 PATH 前面：起 pnpm.exe', () => {
    const root = fixture()
    const exe = standalone(root, 'standalone')
    const npm = npmGlobal(root, 'npm')
    expect(pnpmCommand(windows(exe, npm))).toEqual({ command: join(exe, 'pnpm.exe'), args: [] })
  })

  it('两者都有，npm 布局所在目录在 PATH 前面：起 pnpm.cjs', () => {
    const root = fixture()
    const exe = standalone(root, 'standalone')
    const npm = npmGlobal(root, 'npm')
    expect(pnpmCommand(windows(npm, exe))).toEqual({
      command: NODE,
      args: [join(npm, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')],
    })
  })

  it('pnpm.cmd 旁边没有 pnpm.cjs 时跳过它，继续找后面目录里的 pnpm.exe', () => {
    const root = fixture()
    const bare = cmdOnly(root, 'bare')
    const exe = standalone(root, 'standalone')
    expect(pnpmCommand(windows(bare, exe))).toEqual({ command: join(exe, 'pnpm.exe'), args: [] })
  })

  it('环境变量叫 Path（不是 PATH）时同样按它找', () => {
    const root = fixture()
    const exe = standalone(root, 'standalone')
    expect(pnpmCommand({ platform: 'win32', env: { Path: exe }, execPath: NODE })).toEqual({
      command: join(exe, 'pnpm.exe'),
      args: [],
    })
  })

  it('都找不到：报错，写明找过哪些目录，以及每个目录缺什么', () => {
    const root = fixture()
    const empty = join(root, 'empty')
    mkdirSync(empty)
    const bare = cmdOnly(root, 'bare')
    const message = thrownBy(() => pnpmCommand(windows(empty, bare))).message
    expect(message).toContain(empty)
    expect(message).toContain(bare)
    expect(message).toContain('pnpm.exe')
    expect(message).toContain('pnpm.cjs')
  })

  it('PATH 里没有目录：报错，并说明是 PATH 的问题', () => {
    const message = thrownBy(() =>
      pnpmCommand({ platform: 'win32', env: { PATH: '' }, execPath: NODE }),
    ).message
    expect(message).toContain('PATH')
  })
})

describe('POSIX 上起 pnpm', () => {
  it('直接起 pnpm，不查 PATH 里的目录，PATH 为空也一样', () => {
    const root = fixture()
    const exe = standalone(root, 'standalone')
    const npm = npmGlobal(root, 'npm')
    expect(
      pnpmCommand({
        platform: 'linux',
        env: { PATH: [exe, npm].join(':') },
        execPath: '/usr/bin/node',
      }),
    ).toEqual({ command: 'pnpm', args: [] })
    expect(pnpmCommand({ platform: 'linux', env: {}, execPath: '/usr/bin/node' })).toEqual({
      command: 'pnpm',
      args: [],
    })
  })
})
