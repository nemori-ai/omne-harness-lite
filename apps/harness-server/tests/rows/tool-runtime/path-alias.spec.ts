// 文件根守卫：同一目录的不同写法是同一位置（R2-D374），但两条都满足才在根内（R2-D376）：位置不经任何链接落在根下，
// 解析后的对象也在根的真实路径内。Windows 真实文件系统：8.3 短名取自 `cmd` 的 `%~sI`。本机取不到与长名不同的短名时
// （卷关闭了 8.3 生成），依赖短名的用例跳过并写明原因，不算通过；不在 Windows 上整组跳过。
// 负控：根外目录的长名与短名、`..` 越界、根内指向根外的联接、根外指向根内的联接、`\\?\`、`\\.\`、UNC 与别的盘符。
// 整组不用 `describe.runIf`：分层的 preParse 静态读用例，读不懂它会把整个文件滤掉。
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { confinedToRoot, placeAgainstRoot } from '../../../src/rows/tool-runtime/environment.ts'
import { shortNameOf } from './short-name.ts'

const windows = process.platform === 'win32'
const backslash = String.fromCharCode(92)

describe('the files root guard on Windows (R2-D374, R2-D376)', () => {
  let base = ''
  /** The long and the short spelling of the workspace, of a child of it, and of a sibling outside it. */
  let long = { root: '', child: '', outside: '' }
  let short = { root: '', child: '', outside: '' }
  /** `<outside>\to-ws`: a junction outside the root that points at the child. */
  let outsideToIn = ''
  /** `<base>\ws-link`: a junction beside the root that points at the root. */
  let linkRoot = ''
  let aliased = false

  beforeAll(() => {
    if (!windows) return
    base = realpathSync.native(mkdtempSync(join(tmpdir(), 'omne-alias-')))
    long = {
      root: join(base, 'workspace'),
      child: join(base, 'workspace', 'tank-battle'),
      outside: join(base, 'outside'),
    }
    for (const directory of Object.values(long)) mkdirSync(directory, { recursive: true })
    writeFileSync(join(long.child, 'f.txt'), 'inside')
    writeFileSync(join(long.outside, 'secret.txt'), 'outside')
    short = {
      root: shortNameOf(long.root),
      child: shortNameOf(long.child),
      outside: shortNameOf(long.outside),
    }
    aliased = short.root.toLowerCase() !== long.root.toLowerCase()
    outsideToIn = join(long.outside, 'to-ws')
    symlinkSync(long.child, outsideToIn, 'junction')
    linkRoot = join(base, 'ws-link')
    symlinkSync(long.root, linkRoot, 'junction')
  })

  afterAll(() => {
    if (base === '') return
    rmSync(outsideToIn, { force: true })
    rmSync(linkRoot, { force: true })
    rmSync(base, { recursive: true, force: true })
  })

  beforeEach(context => {
    if (!windows) context.skip('the guard cases use the Windows file system')
  })

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
    const otherCase = drive === drive.toLowerCase() ? drive.toUpperCase() : drive.toLowerCase()
    expect(
      await confinedToRoot(long.root, 'command', { cwd: `${otherCase}${long.child.slice(1)}\\` }),
    ).toBe(true)
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

  // A process started in `<outside>\to-ws` resolves `..` by the text of its directory, outside the root.
  it('a junction outside the root that points into it is refused as cwd and as a Files path', async () => {
    for (const root of [long.root, short.root]) {
      expect(await confinedToRoot(root, 'command', { cwd: outsideToIn })).toBe(false)
      expect(await confinedToRoot(root, 'files', { path: join(outsideToIn, 'f.txt') })).toBe(false)
    }
  })

  it('device, UNC and other-drive spellings of a path inside the root stay refused', async () => {
    const [drive = '', ...rest] = long.child.split(backslash)
    const tail = rest.join(backslash)
    const other = drive.toUpperCase().startsWith('Z') ? 'Y:' : 'Z:'
    const spellings = [
      `${backslash}${backslash}?${backslash}${long.child}`,
      `${backslash}${backslash}.${backslash}${long.child}`,
      `${backslash}${backslash}localhost${backslash}${drive.slice(0, 1)}$${backslash}${tail}`,
      `${other}${backslash}${tail}`,
    ]
    for (const spelling of spellings) {
      expect(await confinedToRoot(long.root, 'command', { cwd: spelling })).toBe(false)
      expect(await confinedToRoot(long.root, 'files', { path: `${spelling}\\f.txt` })).toBe(false)
    }
  })

  it('a root that is a junction: its real path is the root, and its own spelling names itself', async () => {
    // `serve` gives the rows the real path of the workspace; the guard then judges the real names.
    const real = realpathSync.native(linkRoot)
    expect(real.toLowerCase()).toBe(long.root.toLowerCase())
    expect(await placeAgainstRoot(real, real, true)).toBe('root')
    expect(await confinedToRoot(real, 'files', { path: join(real, 'tank-battle', 'f.txt') })).toBe(
      true,
    )
    expect(await confinedToRoot(real, 'command', { cwd: join(real, 'tank-battle') })).toBe(true)
    // A name through the junction is a path through a link outside the real root.
    expect(await confinedToRoot(real, 'command', { cwd: join(linkRoot, 'tank-battle') })).toBe(
      false,
    )
    // A root configured as the junction itself still names the root and what lies below it.
    expect(await placeAgainstRoot(linkRoot, linkRoot, false)).toBe('root')
    expect(await placeAgainstRoot(linkRoot, linkRoot, true)).toBe('root')
    expect(
      await confinedToRoot(linkRoot, 'files', { path: join(linkRoot, 'tank-battle', 'f.txt') }),
    ).toBe(true)
  })
})
