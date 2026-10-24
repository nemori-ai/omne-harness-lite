// The snapshot difference provider of `ri-notes`. The slow cases build temporary Git checkouts
// with real contract members and run the installed, pinned `omne-contract-api` in subprocesses.
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { findPackageJSON } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  contractDiffOf,
  parseDiffRun,
  snapshotContractDiff,
} from '../src/integration/contract-diff.ts'
import { git } from '../src/integration/git.ts'
import { IntegrationError } from '../src/integration/parse.ts'
import { init } from './fixtures/integration.ts'

const homes: string[] = []
afterEach(() => {
  homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true }))
})

const BASE_TSCONFIG = fileURLToPath(
  new URL('../../repo-config/tsconfig.base.json', import.meta.url),
)
const LINES = 'docs/lines.json'
const CONFIG = { members: LINES, snapshot: '{member}/api/{package}.api.md' }
const TIMEOUT_MS = 60_000
type Member = { name: string; dist: string }
const MEMBERS: Record<string, Member> = {
  'pkg/a': { name: '@fixture/a', dist: 'export interface A {\n    a: string;\n}\n' },
  'pkg/b': { name: '@fixture/b', dist: 'export type B = 1;\n' },
  'pkg/c': { name: '@fixture/c', dist: 'export declare const c: number;\n' },
}
const snapshotOf = (member: string) => `${member}/api/${member.slice(4)}.api.md`

function write(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}
function commitAll(root: string, message: string): string {
  git(root, ['add', '-A'])
  git(root, ['commit', '-q', '--allow-empty', '-m', message])
  return git(root, ['rev-parse', 'HEAD'])
}
/** A Git checkout with the README committed; `contracts` writes the members and the line table. */
function checkout(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-contract-diff-')))
  homes.push(root)
  init(root)
  write(root, '.gitignore', 'node_modules/\n')
  write(root, 'README.md', 'fixture\n')
  return root
}
function contracts(root: string, config: object = CONFIG): void {
  copyFileSync(BASE_TSCONFIG, join(root, 'tsconfig.base.json'))
  write(root, 'repo-toolchain.config.json', JSON.stringify({ contractApi: config }, null, 2))
  write(
    root,
    LINES,
    JSON.stringify({ lines: [{ id: 'line', contracts: Object.keys(MEMBERS) }] }, null, 2),
  )
  for (const [path, member] of Object.entries(MEMBERS)) {
    write(
      root,
      join(path, 'package.json'),
      JSON.stringify({
        name: member.name,
        type: 'module',
        exports: { '.': { types: './dist/index.d.ts' } },
      }),
    )
    write(root, join(path, 'dist/index.d.ts'), member.dist)
    const link = join(root, 'node_modules', member.name)
    mkdirSync(dirname(link), { recursive: true })
    rmSync(link, { force: true })
    symlinkSync(join(root, path), link, 'dir')
  }
}
/** The installed CLI, as the provider resolves it. */
function contractApi(root: string, ...args: string[]) {
  const manifest = findPackageJSON('@omne-harness/repo-toolchain', import.meta.url)
  if (manifest === undefined) throw new Error('repo-toolchain is not installed')
  const bin = JSON.parse(readFileSync(manifest, 'utf8')).bin['omne-contract-api']
  const result = spawnSync(process.execPath, [join(dirname(manifest), bin), ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, OMNE_SUBJECT_ROOT: root, OMNE_RUNNER_ROOT: root },
  })
  if (result.status !== 0) throw new Error(`omne-contract-api failed: ${result.stderr}`)
}
/** Rewrites the snapshots from the members' dist with the installed CLI. */
function writeSnapshots(root: string): void {
  contractApi(root, '--write', '--root', root)
}
function diff(root: string, range: { base: string; head: string }, timeoutMs = TIMEOUT_MS) {
  return snapshotContractDiff({ root, timeoutMs })(range)
}

describe('snapshot difference through the installed omne-contract-api', () => {
  it('maps each member to its classification over the range', { tags: ['slow'] }, () => {
    const root = checkout()
    contracts(root)
    writeSnapshots(root)
    const base = commitAll(root, 'snapshots')
    write(
      root,
      'pkg/a/dist/index.d.ts',
      'export interface A {\n    a: string;\n    b?: number;\n}\n',
    )
    write(root, 'pkg/b/dist/index.d.ts', 'export {};\n')
    writeSnapshots(root)
    const head = commitAll(root, 'changes')
    expect(diff(root, { base, head })).toEqual({
      kind: 'available',
      base,
      head,
      members: new Map([
        ['pkg/a', 'additive'],
        ['pkg/b', 'review'],
        ['pkg/c', 'none'],
      ]),
    })
  })

  it('does not run when HEAD is not the range head', { tags: ['slow'] }, () => {
    const root = checkout()
    contracts(root)
    writeSnapshots(root)
    const base = commitAll(root, 'snapshots')
    const head = commitAll(root, 'later')
    git(root, ['checkout', '-q', base])
    const result = diff(root, { base, head })
    expect(result.kind).toBe('unavailable')
    expect(result).toMatchObject({ reason: expect.stringContaining(`HEAD 为 ${base}`) })
  })

  it('does not run when a snapshot file has uncommitted changes', { tags: ['slow'] }, () => {
    const root = checkout()
    contracts(root)
    writeSnapshots(root)
    const base = commitAll(root, 'snapshots')
    write(root, snapshotOf('pkg/b'), 'edited\n')
    const result = diff(root, { base, head: base })
    expect(result.kind).toBe('unavailable')
    expect(result).toMatchObject({ reason: expect.stringContaining(snapshotOf('pkg/b')) })
    expect(result).toMatchObject({ reason: expect.stringContaining('未提交改动') })
  })

  it(
    'reports members without a base snapshot as unknown, not as a change',
    { tags: ['slow'] },
    () => {
      const root = checkout()
      const empty = commitAll(root, 'before the line table')
      contracts(root)
      const unsnapshotted = commitAll(root, 'members without snapshots')
      writeSnapshots(root)
      const head = commitAll(root, 'snapshots')

      const noFiles = diff(root, { base: unsnapshotted, head })
      expect(noFiles.kind).toBe('unavailable')
      for (const member of Object.keys(MEMBERS))
        expect(noFiles).toMatchObject({
          reason: expect.stringContaining(`${member}（基线上没有快照文件 ${snapshotOf(member)}）`),
        })
      const noMembers = diff(root, { base: empty, head })
      expect(noMembers).toMatchObject({
        kind: 'unavailable',
        reason: expect.stringContaining('pkg/a（基线上不是契约成员，没有快照）'),
      })
    },
  )

  it('reports a member whose snapshot left the working tree as unknown', { tags: ['slow'] }, () => {
    const root = checkout()
    contracts(root)
    writeSnapshots(root)
    const base = commitAll(root, 'snapshots')
    rmSync(join(root, snapshotOf('pkg/c')))
    const head = commitAll(root, 'snapshot deleted')
    expect(diff(root, { base, head })).toEqual({
      kind: 'unavailable',
      reason: expect.stringContaining(`pkg/c（工作树没有快照文件 ${snapshotOf('pkg/c')}）`),
    })
  })

  it(
    'reports the exit code and message when the CLI refuses its configuration',
    { tags: ['slow'] },
    () => {
      const root = checkout()
      contracts(root, { ...CONFIG, extra: true })
      const head = commitAll(root, 'bad configuration')
      const result = diff(root, { base: head, head })
      expect(result).toMatchObject({
        kind: 'unavailable',
        reason: expect.stringMatching(/退出码 2：.*认不出的键：extra/),
      })
    },
  )

  it('reports a timeout apart from other failures', { tags: ['slow'] }, () => {
    const root = checkout()
    contracts(root)
    writeSnapshots(root)
    const head = commitAll(root, 'snapshots')
    expect(diff(root, { base: head, head }, 1)).toEqual({
      kind: 'unavailable',
      reason: expect.stringContaining('在 1 毫秒内没有结束'),
    })
  })
})

describe('the CLI diff output at the boundary', () => {
  const base = 'a'.repeat(40),
    head = 'b'.repeat(40)
  const compared = (directory: string, change: string, differences: object[], sides = {}) => ({
    directory,
    status: 'compared',
    ...sides,
    change,
    differences,
  })
  it('refuses output of another shape', () => {
    expect(() => parseDiffRun('not json')).toThrow(IntegrationError)
    expect(() =>
      parseDiffRun(JSON.stringify({ commit: base, members: [{ directory: 'x' }] })),
    ).toThrow(IntegrationError)
    expect(() =>
      parseDiffRun(JSON.stringify({ commit: base, members: [compared('x', 'breaking', [])] })),
    ).toThrow(IntegrationError)
  })
  it('keeps review for a member that left the line table and refuses another base', () => {
    const run = parseDiffRun(
      JSON.stringify({
        base,
        commit: base,
        change: 'review',
        members: [
          compared(
            'pkg/gone',
            'review',
            [
              {
                target: { scope: 'snapshot' },
                kind: 'removed',
                change: 'review',
                reasons: [{ kind: 'outside-whitelist', why: '整份快照删除了' }],
              },
            ],
            { before: 'pkg/gone/api/gone.api.md' },
          ),
        ],
      }),
    )
    expect(contractDiffOf({ base, head }, run)).toEqual({
      kind: 'available',
      base,
      head,
      members: new Map([['pkg/gone', 'review']]),
    })
    expect(contractDiffOf({ base: head, head }, run).kind).toBe('unavailable')
  })
})
