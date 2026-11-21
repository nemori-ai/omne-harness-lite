// 整组不用 `describe.runIf`：分层的 preParse 静态读用例，读不懂它会把整个文件滤掉。
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { confinedToScope, placeAgainstRoot } from '../../../src/rows/tool-runtime/environment.ts'

const both = (root: string) => ({ read: root, write: root })
import { shortNameOf } from './short-name.ts'

const windows = process.platform === 'win32'
const backslash = String.fromCharCode(92)

describe('the files root guard on Windows', () => {
  let base = ''
  let long = { root: '', child: '', outside: '' }
  let short = { root: '', child: '', outside: '' }
  let outsideToIn = ''
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
    expect(await confinedToScope(both(short.root), 'command', 'start', { cwd: long.child })).toBe(
      true,
    )
    expect(
      await confinedToScope(both(short.root), 'files', 'write', {
        path: join(long.child, 'new.txt'),
      }),
    ).toBe(true)
    expect(await placeAgainstRoot(short.root, long.root, false)).toBe('root')
  })

  it('a root set by its long name accepts the short name of a child', async context => {
    needAlias(note => context.skip(note))
    expect(await confinedToScope(both(long.root), 'command', 'start', { cwd: short.child })).toBe(
      true,
    )
    expect(await confinedToScope(both(long.root), 'files', 'write', { path: short.child })).toBe(
      true,
    )
    expect(await placeAgainstRoot(long.root, short.root, true)).toBe('root')
  })

  it('another case of the same names is the same place', async () => {
    expect(
      await confinedToScope(both(long.root), 'command', 'start', { cwd: long.child.toUpperCase() }),
    ).toBe(true)
    expect(
      await confinedToScope(both(long.root.toLowerCase()), 'command', 'start', { cwd: long.child }),
    ).toBe(true)
    const drive = long.child.slice(0, 1)
    const otherCase = drive === drive.toLowerCase() ? drive.toUpperCase() : drive.toLowerCase()
    expect(
      await confinedToScope(both(long.root), 'command', 'start', {
        cwd: `${otherCase}${long.child.slice(1)}\\`,
      }),
    ).toBe(true)
  })

  it('a directory outside the root stays outside in its long and its short name', async () => {
    for (const root of [long.root, short.root])
      for (const outside of [long.outside, short.outside]) {
        expect(await confinedToScope(both(root), 'command', 'start', { cwd: outside })).toBe(false)
        expect(
          await confinedToScope(both(root), 'files', 'write', { path: join(outside, 'x.txt') }),
        ).toBe(false)
      }
  })

  it('a `..` that leaves the root is outside in either spelling', async () => {
    for (const root of [long.root, short.root])
      for (const child of [long.child, short.child]) {
        expect(
          await confinedToScope(both(root), 'command', 'start', { cwd: join(child, '..', '..') }),
        ).toBe(false)
        expect(
          await confinedToScope(both(root), 'files', 'write', {
            path: `${child}\\..\\..\\outside\\x.txt`,
          }),
        ).toBe(false)
      }
  })

  it('a junction inside the root that points outside is refused as cwd and as a step of a Files path', async () => {
    const link = join(long.root, 'to-outside')
    symlinkSync(long.outside, link, 'junction')
    try {
      for (const root of [long.root, short.root]) {
        expect(await confinedToScope(both(root), 'command', 'start', { cwd: link })).toBe(false)
        expect(
          await confinedToScope(both(root), 'files', 'write', { path: join(link, 'x.txt') }),
        ).toBe(false)
        expect(await confinedToScope(both(root), 'files', 'write', { path: link })).toBe(true)
      }
    } finally {
      rmSync(link)
    }
  })

  it('a junction outside the root that points into it is refused as cwd and as a Files path', async () => {
    for (const root of [long.root, short.root]) {
      expect(await confinedToScope(both(root), 'command', 'start', { cwd: outsideToIn })).toBe(
        false,
      )
      expect(
        await confinedToScope(both(root), 'files', 'write', { path: join(outsideToIn, 'f.txt') }),
      ).toBe(false)
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
      expect(await confinedToScope(both(long.root), 'command', 'start', { cwd: spelling })).toBe(
        false,
      )
      expect(
        await confinedToScope(both(long.root), 'files', 'write', { path: `${spelling}\\f.txt` }),
      ).toBe(false)
    }
  })

  it('a root that is a junction: its real path is the root, and its own spelling names itself', async () => {
    const real = realpathSync.native(linkRoot)
    expect(real.toLowerCase()).toBe(long.root.toLowerCase())
    expect(await placeAgainstRoot(real, real, true)).toBe('root')
    expect(
      await confinedToScope(both(real), 'files', 'write', {
        path: join(real, 'tank-battle', 'f.txt'),
      }),
    ).toBe(true)
    expect(
      await confinedToScope(both(real), 'command', 'start', { cwd: join(real, 'tank-battle') }),
    ).toBe(true)
    expect(
      await confinedToScope(both(real), 'command', 'start', { cwd: join(linkRoot, 'tank-battle') }),
    ).toBe(false)
    expect(await placeAgainstRoot(linkRoot, linkRoot, false)).toBe('root')
    expect(await placeAgainstRoot(linkRoot, linkRoot, true)).toBe('root')
    expect(
      await confinedToScope(both(linkRoot), 'files', 'write', {
        path: join(linkRoot, 'tank-battle', 'f.txt'),
      }),
    ).toBe(true)
  })
})
