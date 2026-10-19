import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { installDependencies, type Runner } from './install/consumer.ts'
import {
  assertWorkDirectory,
  inside,
  judgeResolutions,
  judgeTypeFiles,
  listedFiles,
  lockResidue,
  MARKER,
  missingCheckIds,
  requiredCheckIds,
  sourceFiles,
} from './install/judgment.ts'

// Each judgment of the install-closure facility gets an input that it must reject. A judgment
// that always passed would leave the real-install spec green, so these cases are the proof that
// the instrument can fail.
const root = realpathSync(mkdtempSync(join(tmpdir(), 'install-judgment-')))
afterAll(() => rmSync(root, { recursive: true, force: true }))

function file(path: string, text = ''): string {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, text)
  return path
}

describe('inside', () => {
  it('is true only strictly below the directory', () => {
    expect(inside('/a/b/c', '/a/b')).toBe(true)
    expect(inside('/a/b/..cache/x', '/a/b')).toBe(true)
    expect(inside('/a/b', '/a/b')).toBe(false)
    expect(inside('/a/bc', '/a/b')).toBe(false)
    expect(inside('/a', '/a/b')).toBe(false)
    expect(inside('/elsewhere/x', '/a/b')).toBe(false)
  })
})

describe('tarball and lockfile judgments', () => {
  it('lists source files and keeps declarations and built output', () => {
    expect(
      sourceFiles(['dist/index.js', 'dist/index.d.ts', 'src/a.ts', 'tsconfig.build.json', 'x.ts']),
    ).toEqual(['src/a.ts', 'tsconfig.build.json', 'x.ts'])
  })

  it('finds a workspace or link specifier left in a lockfile', () => {
    const lock = 'importers:\n  .:\n    dependencies:\n      a:\n        specifier: link:../a\n'
    expect(lockResidue(lock)).toEqual(['        specifier: link:../a'])
    expect(
      lockResidue('importers:\n  .:\n    dependencies:\n      a:\n        version: 1.0.0\n'),
    ).toEqual([])
  })
})

describe('judgeResolutions', () => {
  const consumer = join(root, 'resolutions', 'consumer')
  const stranger = join(root, 'resolutions', 'ancestor')
  const built = file(join(consumer, 'dist/index.js'))
  const declaration = file(join(consumer, 'dist/types.d.ts'))
  const sourced = file(join(consumer, 'dist/src/impl.js'))
  const typed = file(join(consumer, 'dist/impl.ts'))
  const outsideFile = file(join(stranger, 'leak.js'))
  const link = join(consumer, 'linked.js')
  symlinkSync(outsideFile, link)
  const url = (path: string) => pathToFileURL(path).href

  it('accepts built output, declarations and non-file URLs', () => {
    const verdict = judgeResolutions([url(built), url(declaration), 'node:fs'], consumer)
    expect(verdict).toEqual({ outside: [], source: [] })
  })

  it('reports a resolution outside the consumer, also through a symlink', () => {
    const verdict = judgeResolutions([url(outsideFile), url(link)], consumer)
    expect(verdict.outside).toEqual([outsideFile, outsideFile])
    expect(verdict.source).toEqual([])
  })

  it('reports a src/ path and a non-declaration .ts file as source', () => {
    const verdict = judgeResolutions([url(sourced), url(typed)], consumer)
    expect(verdict.source).toEqual([sourced, typed])
    expect(verdict.outside).toEqual([])
  })
})

describe('judgeTypeFiles', () => {
  const consumer = join(root, 'types', 'consumer')
  const libraries = join(root, 'types', 'lib')
  const own = file(join(consumer, 'node_modules/x/index.d.ts'))
  const lib = file(join(libraries, 'lib.d.ts'))
  const stray = file(join(root, 'types', 'ancestor/node_modules/y/index.d.ts'))

  it('accepts files inside the consumer or the compiler libraries', () => {
    expect(judgeTypeFiles([own, lib], consumer, libraries)).toMatchObject({ ok: true, stray: [] })
  })

  it('rejects a file outside both', () => {
    expect(judgeTypeFiles([own, stray], consumer, libraries)).toMatchObject({
      ok: false,
      stray: [stray],
    })
  })

  it('rejects an empty listing instead of passing vacuously', () => {
    expect(judgeTypeFiles([], consumer, libraries)).toMatchObject({ ok: false, stray: [] })
  })

  it('reads only absolute lines from tsc output', () => {
    expect(listedFiles(`${own}\nVersion 6.0.2\nFiles:  1\n`)).toEqual([own])
  })
})

describe('required check ids', () => {
  const members = ['@a/one', '@a/two']

  it('asks for the per-member checks of every workspace member', () => {
    const required = requiredCheckIds(members)
    for (const name of members)
      expect(required).toEqual(
        expect.arrayContaining([
          `pack:${name}`,
          `tarball-no-source:${name}`,
          `tarball-no-workspace-protocol:${name}`,
        ]),
      )
  })

  it('names the ids that a report leaves out', () => {
    const reported = requiredCheckIds(members)
      .filter(id => id !== 'type-check' && id !== 'probe-run')
      .map(id => ({ id }))
    expect(missingCheckIds(reported, requiredCheckIds(members))).toEqual([
      'probe-run',
      'type-check',
    ])
  })

  it('names the per-member checks of a member whose checks are missing', () => {
    const reported = requiredCheckIds(['@a/one']).map(id => ({ id }))
    expect(missingCheckIds(reported, requiredCheckIds(members))).toEqual([
      'pack:@a/two',
      'tarball-no-source:@a/two',
      'tarball-no-workspace-protocol:@a/two',
    ])
  })

  it('reports nothing missing for a complete list', () => {
    expect(
      missingCheckIds(
        requiredCheckIds(members).map(id => ({ id })),
        requiredCheckIds(members),
      ),
    ).toEqual([])
  })
})

describe('assertWorkDirectory', () => {
  const workspace = join(root, 'guard', 'workspace')
  const member = join(workspace, 'packages/m')
  mkdirSync(member, { recursive: true })
  const check = (directory: string) => () => assertWorkDirectory(directory, member, workspace)

  it('accepts new and empty directories below the allowed roots', () => {
    expect(check(join(workspace, 'tmp/install-closure/new'))).not.toThrow()
    expect(check(join(member, 'tmp/new'))).not.toThrow()
    mkdirSync(join(workspace, 'tmp/install-closure/empty'), { recursive: true })
    expect(check(join(workspace, 'tmp/install-closure/empty'))).not.toThrow()
  })

  it('refuses the member, the roots themselves and anything else', () => {
    for (const path of [
      member,
      workspace,
      join(workspace, 'tmp'),
      join(workspace, 'tmp/install-closure'),
      join(member, 'tmp'),
      join(workspace, 'tmp/other/x'),
      root,
    ])
      expect(check(path), path).toThrow(/refusing work directory/u)
  })

  it('refuses a non-empty directory without the marker and accepts it with the marker', () => {
    const directory = join(workspace, 'tmp/install-closure/used')
    file(join(directory, 'precious.txt'))
    expect(check(directory)).toThrow(MARKER)
    writeFileSync(join(directory, MARKER), '')
    expect(check(directory)).not.toThrow()
  })

  it('refuses a symlink', () => {
    const target = join(root, 'guard', 'elsewhere')
    mkdirSync(target, { recursive: true })
    const link = join(workspace, 'tmp/install-closure/link')
    mkdirSync(join(link, '..'), { recursive: true })
    symlinkSync(target, link)
    expect(check(link)).toThrow(/symlink/u)
  })
})

describe('installDependencies', () => {
  const failing =
    (calls: string[][]): Runner =>
    (_command, args) => {
      calls.push([...args])
      return { status: 1, stdout: '', stderr: 'ERR_PNPM_NO_OFFLINE_META' }
    }

  it('fails after a failed --offline install when the network is not allowed', () => {
    const calls: string[][] = []
    const result = installDependencies('/p', { allowNetwork: false }, failing(calls))
    expect(result).toMatchObject({ ok: false, mode: 'offline' })
    expect(result.detail).toContain('ERR_PNPM_NO_OFFLINE_META')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('--offline')
  })

  it('falls back to --prefer-offline only when allowed, and says so', () => {
    const calls: string[][] = []
    const runner: Runner = (command, args, cwd) => {
      calls.push([...args])
      return args.includes('--offline')
        ? failing([])(command, args, cwd)
        : { status: 0, stdout: '', stderr: '' }
    }
    const result = installDependencies('/p', { allowNetwork: true }, runner)
    expect(result).toMatchObject({ ok: true, mode: 'network' })
    expect(calls.map(args => args.at(-1))).toEqual(['--offline', '--prefer-offline'])
  })

  it('reports mode offline when the offline install works, and never retries', () => {
    const calls: string[][] = []
    const result = installDependencies('/p', { allowNetwork: true }, (_c, args) => {
      calls.push([...args])
      return { status: 0, stdout: '', stderr: '' }
    })
    expect(result).toMatchObject({ ok: true, mode: 'offline' })
    expect(calls).toHaveLength(1)
  })

  it('passes a store directory to every attempt', () => {
    const calls: string[][] = []
    installDependencies('/p', { allowNetwork: true, storeDirectory: '/s' }, failing(calls))
    expect(calls).toHaveLength(2)
    for (const args of calls) expect(args.join(' ')).toContain('--store-dir /s')
  })
})
