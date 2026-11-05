// A files root and a path that spell the same directory in two ways (R2-D374): the 8.3 short name
// and the long name, or another case. The root's segments are matched as the same directory entry,
// so either spelling reaches the root; a path outside the root, a `..`, and a link of another name
// stay refused. Short names come from `cmd` (`%~sI`). When this host gives no short name that
// differs from the long one (8.3 names turned off), the cases that need it are skipped, not passed.
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createHostFilesEngine, hostObjectToken } from '../../src/host-files.ts'
import { windowsSegmentsBelow } from '../../src/root-segments.ts'
import { request } from './fixture.ts'

function shortNameOf(path: string): string {
  const ran = spawnSync('cmd.exe', ['/d', '/s', '/c', `"for %I in ("${path}") do @echo %~sI"`], {
    windowsVerbatimArguments: true,
    encoding: 'utf8',
  })
  const found = ran.stdout.trim()
  if (ran.status !== 0 || found === '') throw new Error(`cmd gave no short name for ${path}`)
  return found
}

beforeEach(context => context.skip(process.platform !== 'win32'))

describe('the root of the Windows files backend in another spelling', () => {
  let base = ''
  let long = { root: '', file: '', outside: '' }
  let short = { root: '', file: '', outside: '' }
  let aliased = false

  beforeAll(async () => {
    if (process.platform !== 'win32') return
    base = await realpath(await mkdtemp(join(tmpdir(), 'omne-winalias-')))
    long = {
      root: join(base, 'workspace'),
      file: join(base, 'workspace', 'tank.txt'),
      outside: join(base, 'outside'),
    }
    await mkdir(long.root)
    await mkdir(long.outside)
    await writeFile(long.file, 'tank')
    await writeFile(join(long.outside, 'tank.txt'), 'outside')
    short = {
      root: shortNameOf(long.root),
      file: shortNameOf(long.file),
      outside: shortNameOf(long.outside),
    }
    aliased = short.root.toLowerCase() !== long.root.toLowerCase()
  })

  afterAll(async () => {
    if (base !== '') await rm(base, { recursive: true, force: true })
  })

  const needAlias = (skip: (note: string) => void) => {
    if (!aliased) skip('this host gives no 8.3 short name that differs from the long name')
  }

  it('finds the segments below a root in its short name for a path in its long name, and back', async context => {
    needAlias(note => context.skip(note))
    expect(await windowsSegmentsBelow(short.root, long.file)).toEqual(['tank.txt'])
    expect(await windowsSegmentsBelow(long.root, short.file)).toEqual(['tank.txt'])
    expect(await windowsSegmentsBelow(short.root, long.root)).toEqual([])
  })

  it('matches another case of the root as text', async () => {
    expect(await windowsSegmentsBelow(long.root.toUpperCase(), long.file)).toEqual(['tank.txt'])
  })

  it('refuses a path outside the root in its long and its short name, and a `..`', async () => {
    for (const root of [long.root, short.root]) {
      for (const outside of [long.outside, short.outside])
        expect(await windowsSegmentsBelow(root, join(outside, 'tank.txt'))).toBeUndefined()
      expect(await windowsSegmentsBelow(root, `${root}\\..\\outside\\tank.txt`)).toBeUndefined()
      expect(await windowsSegmentsBelow(root, base)).toBeUndefined()
    }
  })

  it('refuses device, UNC and other-drive spellings of a path inside the root', async () => {
    const back = String.fromCharCode(92)
    const [drive = '', ...rest] = long.file.split(back)
    const tail = rest.join(back)
    const other = drive.toUpperCase().startsWith('Z') ? 'Y:' : 'Z:'
    for (const spelling of [
      `${back}${back}?${back}${long.file}`,
      `${back}${back}.${back}${long.file}`,
      `${back}${back}localhost${back}${drive.slice(0, 1)}$${back}${tail}`,
      `${other}${back}${tail}`,
    ])
      expect(await windowsSegmentsBelow(long.root, spelling)).toBeUndefined()
  })

  it('refuses a junction of another name beside the root, even when it points at the root', async () => {
    const beside = join(base, 'alias-of-workspace')
    await symlink(long.root, beside, 'junction')
    try {
      for (const root of [long.root, short.root])
        expect(await windowsSegmentsBelow(root, join(beside, 'tank.txt'))).toBeUndefined()
    } finally {
      await rm(beside)
    }
  })

  it('a rooted engine reads through the other spelling and refuses outside the root', async context => {
    needAlias(note => context.skip(note))
    const named = await hostObjectToken(long.file)
    for (const [root, path] of [
      [short.root, long.file],
      [long.root, short.file],
    ] as const) {
      const files = createHostFilesEngine({ root }).facilityFor('owner')
      const stat = await files.stat(request(path, named))
      expect(stat).toMatchObject({ kind: 'done', value: { object: named } })
      for (const outside of [long.outside, short.outside]) {
        const target = join(outside, 'tank.txt')
        expect(await files.stat(request(target, await hostObjectToken(target)))).toMatchObject({
          kind: 'rejected',
          reason: 'notAuthorized',
        })
      }
    }
  }, 60_000)
})
