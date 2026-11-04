// 文件根守卫把同一目录的不同写法当成同一位置（R2-D374）：根与路径先归一成规范形式再判断包含。
// Windows 真实文件系统：8.3 短名取自 `cmd` 的 `%~sI`。本机取不到与长名不同的短名时（卷关闭了 8.3 生成），
// 依赖短名的用例跳过并写明原因，不算通过。负控：根外目录的长名与短名、`..` 越界、根内指向根外的联接。
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { confinedToRoot, placeAgainstRoot } from '../../../src/rows/tool-runtime/environment.ts'
import { shortNameOf } from './short-name.ts'

const windows = process.platform === 'win32'

describe.runIf(windows)('the files root guard on Windows judges canonical paths (R2-D374)', () => {
  let base = ''
  /** The long and the short spelling of the workspace, of a child of it, and of a sibling outside it. */
  let long = { root: '', child: '', outside: '' }
  let short = { root: '', child: '', outside: '' }
  let aliased = false

  beforeAll(() => {
    base = realpathSync.native(mkdtempSync(join(tmpdir(), 'omne-alias-')))
    long = {
      root: join(base, 'workspace'),
      child: join(base, 'workspace', 'tank-battle'),
      outside: join(base, 'outside'),
    }
    for (const directory of Object.values(long)) mkdirSync(directory, { recursive: true })
    short = {
      root: shortNameOf(long.root),
      child: shortNameOf(long.child),
      outside: shortNameOf(long.outside),
    }
    aliased = short.root.toLowerCase() !== long.root.toLowerCase()
  })

  afterAll(() => rmSync(base, { recursive: true, force: true }))

  const needAlias = (skip: (note: string) => void) => {
    if (!aliased) skip('this host gives no 8.3 short name that differs from the long name')
  }

  it('a root set by its short name accepts the long name of a child as cwd and as a Files path', async context => {
    needAlias(note => context.skip(note))
    expect(await confinedToRoot(short.root, 'command', { cwd: long.child })).toBe(true)
    expect(await confinedToRoot(short.root, 'files', { path: join(long.child, 'new.txt') })).toBe(
      true,
    )
    expect(await placeAgainstRoot(short.root, long.root, false)).toBe('root')
  })

  it('a root set by its long name accepts the short name of a child', async context => {
    needAlias(note => context.skip(note))
    expect(await confinedToRoot(long.root, 'command', { cwd: short.child })).toBe(true)
    expect(await confinedToRoot(long.root, 'files', { path: short.child })).toBe(true)
    expect(await placeAgainstRoot(long.root, short.root, true)).toBe('root')
  })

  it('another case of the same names is the same place', async () => {
    expect(await confinedToRoot(long.root, 'command', { cwd: long.child.toUpperCase() })).toBe(true)
    expect(await confinedToRoot(long.root.toLowerCase(), 'command', { cwd: long.child })).toBe(true)
    const drive = long.child.slice(0, 1)
    const otherDrive =
      (drive === drive.toLowerCase() ? drive.toUpperCase() : drive.toLowerCase()) +
      long.child.slice(1)
    expect(await confinedToRoot(long.root, 'command', { cwd: `${otherDrive}\\` })).toBe(true)
  })

  it('a directory outside the root stays outside in its long and its short name', async () => {
    for (const root of [long.root, short.root])
      for (const outside of [long.outside, short.outside]) {
        expect(await confinedToRoot(root, 'command', { cwd: outside })).toBe(false)
        expect(await confinedToRoot(root, 'files', { path: join(outside, 'x.txt') })).toBe(false)
      }
  })

  it('a `..` that leaves the root is outside in either spelling', async () => {
    for (const root of [long.root, short.root])
      for (const child of [long.child, short.child]) {
        expect(await confinedToRoot(root, 'command', { cwd: join(child, '..', '..') })).toBe(false)
        expect(
          await confinedToRoot(root, 'files', { path: `${child}\\..\\..\\outside\\x.txt` }),
        ).toBe(false)
      }
  })

  it('a junction inside the root that points outside is refused as cwd and as a step of a Files path', async () => {
    const link = join(long.root, 'to-outside')
    symlinkSync(long.outside, link, 'junction')
    try {
      for (const root of [long.root, short.root]) {
        expect(await confinedToRoot(root, 'command', { cwd: link })).toBe(false)
        expect(await confinedToRoot(root, 'files', { path: join(link, 'x.txt') })).toBe(false)
        // The link itself lies inside the root: the files facility decides what an operation on it does.
        expect(await confinedToRoot(root, 'files', { path: link })).toBe(true)
      }
    } finally {
      rmSync(link)
    }
  })
})
