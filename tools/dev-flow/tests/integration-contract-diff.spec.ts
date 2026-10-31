// The snapshot difference provider of `ri-notes`. The slow cases build temporary Git checkouts
// with real contract members and run the installed, pinned `omne-contract-api` in subprocesses.
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  contractDiffOf,
  parseDiffRun,
  runDiff,
  snapshotContractDiff,
} from '../src/integration/contract-diff.ts'
import { git } from '../src/integration/git.ts'
import { IntegrationError } from '../src/integration/parse.ts'
import {
  A_ADDITIVE,
  contracts,
  MEMBERS,
  SNAPSHOT_TEMPLATE,
  snapshotOf,
  write,
  writeSnapshots,
} from './fixtures/contract-api.ts'
import { init } from './fixtures/integration.ts'

const homes: string[] = []
afterEach(() => {
  homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true }))
})

const LINES = 'docs/lines.json'
const CONFIG = { members: LINES, snapshot: SNAPSHOT_TEMPLATE }
const LINE_TABLE = { lines: [{ id: 'line', contracts: Object.keys(MEMBERS) }] }
const TIMEOUT_MS = 60_000

function temporary(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-contract-diff-')))
  homes.push(root)
  return root
}
function commitAll(root: string, message: string): string {
  git(root, ['add', '-A'])
  git(root, ['commit', '-q', '--allow-empty', '-m', message])
  return git(root, ['rev-parse', 'HEAD'])
}
/** A Git checkout with the README committed and `node_modules/` ignored. */
function checkout(): string {
  const root = temporary()
  init(root)
  write(root, '.gitignore', 'node_modules/\n')
  write(root, 'README.md', 'fixture\n')
  return root
}
/** A checkout whose HEAD holds the members, the line table and their snapshots. */
function snapshotted(): { root: string; head: string } {
  const root = checkout()
  contracts(root, CONFIG, LINE_TABLE)
  writeSnapshots(root)
  return { root, head: commitAll(root, 'snapshots') }
}
function diff(root: string, range: { base: string; head: string }, timeoutMs = TIMEOUT_MS) {
  return snapshotContractDiff({ root, timeoutMs })(range)
}

describe('snapshot difference through the installed omne-contract-api', () => {
  it('maps each member to its classification over the range', { tags: ['slow'] }, () => {
    const { root, head: base } = snapshotted()
    write(root, 'pkg/a/dist/index.d.ts', A_ADDITIVE)
    write(root, 'pkg/b/dist/index.d.ts', 'export {};\n')
    writeSnapshots(root)
    const head = commitAll(root, 'changes')
    // The ignored `node_modules/` links do not count as changes to the working tree.
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
    const { root, head: base } = snapshotted()
    const head = commitAll(root, 'later')
    git(root, ['checkout', '-q', base])
    expect(diff(root, { base, head })).toEqual({
      kind: 'unavailable',
      reason: expect.stringContaining(`HEAD 为 ${base}，不是范围头 ${head}`),
    })
  })

  it(
    'does not run when the working tree has any uncommitted or untracked file',
    { tags: ['slow'] },
    () => {
      const { root, head } = snapshotted()
      const dirty = {
        kind: 'unavailable',
        reason: expect.stringContaining('有未提交改动或未跟踪文件'),
      }
      const changes: [string, () => void][] = [
        ['a snapshot', () => write(root, snapshotOf('pkg/b'), 'edited\n')],
        ['a member manifest', () => write(root, 'pkg/b/package.json', '{}\n')],
        ['an untracked file', () => write(root, 'notes.txt', 'draft\n')],
      ]
      for (const [what, change] of changes) {
        change()
        expect(diff(root, { base: head, head }), what).toEqual(dirty)
        git(root, ['checkout', '-q', '--', '.'])
        git(root, ['clean', '-q', '-f'])
      }
      expect(diff(root, { base: head, head }).kind).toBe('available')
    },
  )

  it(
    'reports members without a base snapshot as unknown, not as a change',
    { tags: ['slow'] },
    () => {
      const root = checkout()
      const empty = commitAll(root, 'before the line table')
      contracts(root, CONFIG, LINE_TABLE)
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

  it('reports members with a snapshot on neither side as unknown', { tags: ['slow'] }, () => {
    const root = checkout()
    contracts(root, CONFIG, LINE_TABLE)
    const head = commitAll(root, 'members without snapshots')
    const result = diff(root, { base: head, head })
    expect(result.kind).toBe('unavailable')
    for (const member of Object.keys(MEMBERS))
      expect(result).toMatchObject({
        reason: expect.stringContaining(`${member}（基线与工作树都没有快照文件）`),
      })
  })

  it('reports a member whose snapshot left the working tree as unknown', { tags: ['slow'] }, () => {
    const { root, head: base } = snapshotted()
    rmSync(join(root, snapshotOf('pkg/c')))
    const head = commitAll(root, 'snapshot deleted')
    expect(diff(root, { base, head })).toEqual({
      kind: 'unavailable',
      reason: expect.stringContaining(`pkg/c（工作树没有快照文件 ${snapshotOf('pkg/c')}）`),
    })
  })

  it('reports a member whose snapshot cannot be read back as unknown', { tags: ['slow'] }, () => {
    const { root, head: base } = snapshotted()
    write(root, snapshotOf('pkg/b'), 'not a snapshot\n')
    const head = commitAll(root, 'snapshot broken')
    const result = diff(root, { base, head })
    expect(result).toEqual({
      kind: 'unavailable',
      reason: expect.stringContaining('pkg/b（快照读不出：'),
    })
    expect(result).toMatchObject({ reason: expect.stringContaining('1 个契约成员') })
  })

  it(
    'reports the exit code and message when the CLI refuses its configuration',
    { tags: ['slow'] },
    () => {
      const root = checkout()
      contracts(root, { ...CONFIG, extra: true }, LINE_TABLE)
      const head = commitAll(root, 'bad configuration')
      expect(diff(root, { base: head, head })).toEqual({
        kind: 'unavailable',
        reason: expect.stringMatching(/退出码 2：.*认不出的键：extra/),
      })
    },
  )

  it('reports a timeout apart from other failures', { tags: ['slow'] }, () => {
    const { root, head } = snapshotted()
    expect(diff(root, { base: head, head }, 1)).toEqual({
      kind: 'unavailable',
      reason: expect.stringContaining('在 1 毫秒内没有结束'),
    })
  })
})

// 起不了进程时的错误码：POSIX 上没有执行位的文件是 EACCES；Windows 不看执行位，非可执行映像按找不到报 ENOENT。
const CANNOT_START = process.platform === 'win32' ? 'ENOENT' : 'EACCES'

describe('snapshot difference failures before the CLI output', () => {
  it('reports a Git failure in the checkout as unavailable', () => {
    const root = temporary()
    const sha = 'a'.repeat(40)
    expect(diff(root, { base: sha, head: sha })).toEqual({
      kind: 'unavailable',
      reason: expect.stringMatching(/读不出检出 .* 的 Git 状态：git status failed/),
    })
  })
  it('reports a process that cannot start with its error code', () => {
    const root = temporary(),
      file = join(root, 'not-executable')
    writeFileSync(file, 'plain text\n', { mode: 0o644 })
    const sha = 'a'.repeat(40)
    expect(runDiff({ file, args: [] }, { root, base: sha, timeoutMs: TIMEOUT_MS })).toEqual({
      kind: 'unavailable',
      reason: expect.stringContaining(`进程出错（${CANNOT_START}）`),
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
