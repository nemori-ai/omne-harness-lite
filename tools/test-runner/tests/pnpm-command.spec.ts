// `pnpmCommand` 怎样选起 pnpm：Windows 上按 PATH 顺序找 pnpm.exe，或旁边有 pnpm.cjs 的 pnpm.cmd；POSIX 上就是 pnpm。
// 只看文件在不在、命令怎样拼，不起子进程。布局造在临时目录里，平台、PATH 与 Node 路径都由调用方注入。
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pnpmCommand } from '../src/testing/support.ts'

const NODE = 'node-under-test'
const EXE = 'pnpm.exe'
const CMD = 'pnpm.cmd'
/** npm 全局安装的布局：pnpm.cmd 旁边的 pnpm.cjs。 */
const CJS = join('node_modules', 'pnpm', 'bin', 'pnpm.cjs')

let root: string

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'pnpm-command-')))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** 在临时目录下建 `name` 目录，放进 `files`（相对该目录的路径，内容为空）。返回目录的路径。 */
function directory(name: string, files: readonly string[] = []): string {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  for (const file of files) {
    mkdirSync(dirname(join(dir, file)), { recursive: true })
    writeFileSync(join(dir, file), '')
  }
  return dir
}

/** 按给定的 PATH 目录顺序、平台与 Node 路径选命令。 */
function pickPnpm(dirs: readonly string[], platform: NodeJS.Platform = 'win32') {
  return pnpmCommand({ platform, path: dirs.join(';'), execPath: NODE })
}

/** 取报错的消息；没有报错就让用例失败。 */
function errorOf(dirs: readonly string[]): string {
  try {
    pickPnpm(dirs)
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  return expect.fail('应当报错，却返回了一条命令')
}

describe('pnpmCommand', () => {
  it('Windows 上只有 pnpm.exe 时起这个 .exe，不加前置参数', () => {
    const exe = directory('exe', [EXE])
    expect(pickPnpm([exe])).toEqual({ command: join(exe, EXE), args: [] })
  })

  it('Windows 上只有 npm 全局布局时，用注入的 Node 起旁边的 pnpm.cjs', () => {
    const npm = directory('npm', [CMD, CJS])
    expect(pickPnpm([npm])).toEqual({ command: NODE, args: [join(npm, CJS)] })
  })

  it('exe 与 npm 布局在不同目录时，PATH 里先到的生效：exe 所在目录在前', () => {
    const exe = directory('exe', [EXE])
    const npm = directory('npm', [CMD, CJS])
    expect(pickPnpm([exe, npm])).toEqual({ command: join(exe, EXE), args: [] })
  })

  it('exe 与 npm 布局在不同目录时，PATH 里先到的生效：npm 布局所在目录在前', () => {
    const exe = directory('exe', [EXE])
    const npm = directory('npm', [CMD, CJS])
    expect(pickPnpm([npm, exe])).toEqual({ command: NODE, args: [join(npm, CJS)] })
  })

  it('同一目录里 pnpm.exe 与 pnpm.cmd 都有时起 .exe', () => {
    const both = directory('both', [EXE, CMD, CJS])
    expect(pickPnpm([both])).toEqual({ command: join(both, EXE), args: [] })
  })

  it('先遇到的 pnpm.cmd 旁边没有 pnpm.cjs 就跳过，后面目录里的 pnpm.exe 生效', () => {
    const cmdOnly = directory('cmd-only', [CMD])
    const exe = directory('exe', [EXE])
    expect(pickPnpm([cmdOnly, exe])).toEqual({ command: join(exe, EXE), args: [] })
  })

  it('都找不到时报错，消息逐个写明找过的目录与各缺什么', () => {
    const empty = directory('empty')
    const cmdOnly = directory('cmd-only', [CMD])
    const parts = errorOf([empty, cmdOnly]).split('；')
    expect(parts.find(part => part.includes(empty))).toContain('pnpm.exe')
    expect(parts.find(part => part.includes(cmdOnly))).toContain('pnpm.cjs')
  })

  it.each(['linux', 'darwin'] as const)('%s 上返回 pnpm，不看 PATH', platform => {
    const exe = directory('exe', [EXE])
    expect(pickPnpm([exe], platform)).toEqual({ command: 'pnpm', args: [] })
  })
})
