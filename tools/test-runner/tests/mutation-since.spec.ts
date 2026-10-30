// 差分变异 `--since` 的取值核对与范围收窄，用真实 git 夹具仓库。
// 历史（左旧右新）：
//   p ─ m0 ─ t1                          target 分支，targetBase = t1，与任务分支的合并点 = m0
//   │    └─ w1 ─ R ─ merge(s) ─ w3        任务分支，HEAD = w3
//   └─ s ────────────┘                    旁支：从 m0 之前分出，合并进任务分支
// w1 改 a.ts 第 2 行与 b.ts 第 1 行；R 改 a.ts 第 8 行；s 新增 side.ts；w3 改 a.ts 第 9 行，并把 b.ts 第 1 行改回 m0 原样。
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { changedLines } from '@omne-harness/repo-toolchain/core/git'
import type { TestMember } from '@omne-harness/repo-toolchain/core/workspace'
import { changedTargets } from '../src/mutation/scope.ts'
import { SinceRefusal, sinceRange } from '../src/mutation/since.ts'

const SRC = 'packages/core/a/src'
const MEMBERS: TestMember[] = [
  { path: 'packages/core/a', name: '@fixture/a', script: 'vitest run', dependencies: [] },
]

let root = ''
const commits: Record<'p' | 'm0' | 't1' | 'r' | 's' | 'head', string> = {
  p: '',
  m0: '',
  t1: '',
  r: '',
  s: '',
  head: '',
}

const git = (...args: string[]) =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
const put = (path: string, lines: string[]) => {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), `${lines.join('\n')}\n`)
}
const numbered = (count: number, name: string) =>
  Array.from({ length: count }, (_, index) => `export const ${name}${index + 1} = ${index + 1}`)
const commit = (message: string) => {
  git('add', '-A')
  git('commit', '-q', '-m', message)
  return git('rev-parse', 'HEAD')
}
const edit = (lines: string[], line: number, text: string) =>
  lines.map((value, index) => (index === line - 1 ? text : value))

const A = numbered(10, 'a')
const B = numbered(5, 'b')
/** HEAD 上 a.ts 的内容。 */
let aHead: string[] = []

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-since-')))
  git('init', '-q', '-b', 'task')
  git('config', 'user.email', 'fixture@example.invalid')
  git('config', 'user.name', 'Fixture')
  git('config', 'core.autocrlf', 'false')
  put(`${SRC}/a.ts`, A)
  put(`${SRC}/b.ts`, B)
  commits.p = commit('p')
  git('branch', 'side')
  const a0 = edit(A, 10, 'export const a10 = 100')
  put(`${SRC}/a.ts`, a0)
  commits.m0 = commit('m0')
  git('checkout', '-q', '-b', 'target')
  put(`${SRC}/target.ts`, ['export const t = 1'])
  commits.t1 = commit('t1')
  git('checkout', '-q', 'task')
  const a1 = edit(a0, 2, 'export const a2 = 20')
  put(`${SRC}/a.ts`, a1)
  put(`${SRC}/b.ts`, edit(B, 1, 'export const b1 = 10'))
  commit('w1')
  const a2 = edit(a1, 8, 'export const a8 = 80')
  put(`${SRC}/a.ts`, a2)
  commits.r = commit('R')
  git('checkout', '-q', 'side')
  put(`${SRC}/side.ts`, ['export const s = 1'])
  commits.s = commit('s')
  git('checkout', '-q', 'task')
  git('merge', '-q', '--no-ff', '--no-edit', 'side')
  aHead = edit(a2, 9, 'export const a9 = 90')
  put(`${SRC}/a.ts`, aHead)
  put(`${SRC}/b.ts`, B)
  commits.head = commit('w3')
})

afterAll(() => {
  if (root !== '') rmSync(root, { recursive: true, force: true })
})

/** 运行一次，返回抛出的东西；没抛就是 undefined。 */
const thrown = (run: () => unknown): unknown => {
  try {
    run()
  } catch (error) {
    return error
  }
  return undefined
}
/** `--since` 被拒绝时的原因；没被拒绝或抛的不是 `SinceRefusal` 时测试失败。 */
const refusal = (since: string): string => {
  const error = thrown(() => sinceRange({ root, since, base: 'target' }))
  if (!(error instanceof SinceRefusal))
    throw new Error(`--since ${since} 没有被拒绝：${String(error)}`)
  return error.message
}

describe('--since 的取值', () => {
  it('HEAD 的祖先且在合并点之后：通过，只留它以来改动、且与合并点相比仍有改动的行', () => {
    const range = sinceRange({ root, since: commits.r, base: 'target' })
    expect(range.commit).toBe(commits.r)
    expect(range.mergeBase).toBe(commits.m0)
    // R 以来 b.ts 第 1 行改回了合并点原样：只看 R..工作树会列出它，收窄后不在内。
    expect(changedLines(root, commits.r).get(`${SRC}/b.ts`)).toEqual([[1, 1]])
    expect(Object.fromEntries(range.lines)).toEqual({
      [`${SRC}/a.ts`]: [[9, 9]],
      [`${SRC}/side.ts`]: [[1, 1]],
    })
  })

  it('取合并点时，范围与现有实现（合并点到工作树的改动行）相同', () => {
    for (const since of [commits.m0, 'target~1']) {
      const range = sinceRange({ root, since, base: 'target' })
      const existing = changedLines(root, commits.m0)
      expect(range.lines).toEqual(existing)
      expect(changedTargets(range.lines, MEMBERS)).toEqual(changedTargets(existing, MEMBERS))
    }
  })

  it('取 HEAD 时只剩未提交的改动，与现有实现一样算进工作树', () => {
    put(`${SRC}/a.ts`, edit(aHead, 5, 'export const a5 = 50'))
    try {
      expect(Object.fromEntries(sinceRange({ root, since: 'HEAD', base: 'target' }).lines)).toEqual(
        {
          [`${SRC}/a.ts`]: [[5, 5]],
        },
      )
    } finally {
      git('checkout', '--', `${SRC}/a.ts`)
    }
  })

  it('不是 HEAD 的祖先：拒绝', () => {
    expect(refusal(commits.t1)).toMatch(/不是 HEAD（[0-9a-f]{9}）的祖先/u)
  })

  it('早于基线与 HEAD 的合并点：拒绝，并说明 --since 只收窄', () => {
    const message = refusal(commits.p)
    expect(message).toContain(`早于基线 target 与 HEAD 的合并点 ${commits.m0.slice(0, 9)}`)
    expect(message).toContain('只收窄变异范围')
  })

  it('在合并进来的旁支上（是 HEAD 的祖先，但不在合并点之后）：拒绝', () => {
    const message = refusal(commits.s)
    expect(message).toContain('不在基线 target 与 HEAD 的合并点')
    expect(message).toContain('合并进来的旁支')
    expect(message).not.toContain('第一父线')
  })

  it('在 HEAD 的第一父线上、但早于同步合并进来的合并点：拒绝，原因说第一父线而不是旁支', () => {
    git('checkout', '-q', '-b', 'synced', 'task')
    try {
      git('merge', '-q', '--no-ff', '--no-edit', 'target')
      const message = refusal(commits.r)
      expect(message).toContain('在 HEAD 的第一父线上')
      expect(message).toContain(`早于基线 target 与 HEAD 的合并点 ${commits.t1.slice(0, 9)}`)
      expect(message).toContain('改用合并点之后的提交')
      expect(message).not.toContain('旁支')
    } finally {
      git('checkout', '-q', 'task')
      git('branch', '-q', '-D', 'synced')
    }
  })

  it('引用不存在、为空、以 - 开头：拒绝', () => {
    expect(refusal('no-such-ref')).toContain('本仓库里没有这个提交')
    expect(refusal(' ')).toContain('要给一个提交')
    expect(refusal('--all')).toContain('不能以 - 开头')
  })

  it('基线本身不存在不是 --since 的错：普通错误', () => {
    const error = thrown(() => sinceRange({ root, since: commits.r, base: 'no-such-base' }))
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(SinceRefusal)
    expect(String(error)).toContain('基线 no-such-base 不是本仓库里的提交')
  })
})
