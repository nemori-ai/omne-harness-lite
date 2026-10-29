// @module-tag slow
// 归慢层：每条用例在临时 git 仓库里建提交并量收工钩子的读数。全量准入快层账本里整份合计 17.5 秒，负载下 30.8 秒，只标超预算的那一条，余下仍有 13.4 秒（负载下 22.1 秒），过了 10 秒线（tools/test-runner/README_ZH.md「归层」）。
// 收工钩子的基线：没有 task context 时取主线与活跃轨道里离 HEAD 最近的合并点，有 context 时仍用 taskBase；
// 成员发现不把被 git 忽略的目录（变异运行器的沙箱）里的成员副本当成员。用临时 git 仓库，不跑度量。
import { realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readArchitectureSource } from '../src/arch/source.ts'
import { changedFiles, ignoredDirectories } from '../src/core/git.ts'
import { taskContextPath } from '../src/core/task-context.ts'
import { readLoopConfig } from '../src/loop/config.ts'
import { POLICY_PATH } from '../src/loop/hook-base.ts'
import { measureForHook, touchedBase } from '../src/loop/hook-measure.ts'
import { readMetricsConfig } from '../src/metrics/config.ts'
import {
  commit,
  git,
  removeTemporaries,
  repository,
  write,
} from './fixtures/loop-canary/repository.ts'

afterEach(removeTemporaries)

const TRACK = 'integration/track'

/** 登记一条轨道；`status` 之外的字段与本仓库的登记同形。 */
const policy = (status: string) =>
  JSON.stringify({
    schemaVersion: 1,
    tracks: [{ id: 'track', branch: TRACK, owner: 'someone', status, initialMain: 'x' }],
    transport: { kind: 'remote', location: 'origin' },
  })

/** 主线上有成员 `packages/core/a`、轨道登记（可换成别的内容），当前在 main。 */
function trunk(policyText: string = policy('active')): string {
  const root = repository()
  write(root, POLICY_PATH, policyText)
  write(root, 'packages/core/a/src/index.ts', 'export const a = 1\n')
  commit(root, 'member and track registry')
  return root
}

/** 在当前分支上提交一处产品源码改动，返回提交。 */
function edit(root: string, name: string): string {
  write(root, `packages/core/a/src/${name}.ts`, `export const ${name} = 1\n`)
  return commit(root, name)
}

/** 从 main 分出轨道、在轨道上提交两次、再从轨道首个提交分出工作分支并提交自己的改动；返回轨道首尾与工作提交。 */
function branchedFromTrack(root: string): { first: string; tip: string; work: string } {
  git(root, 'checkout', '-q', '-b', TRACK)
  const first = edit(root, 'trackFirst')
  git(root, 'checkout', '-q', '-b', 'someone/work')
  const work = edit(root, 'work')
  git(root, 'checkout', '-q', TRACK)
  const tip = edit(root, 'trackTip')
  git(root, 'checkout', '-q', 'someone/work')
  git(root, 'merge', '-q', '--no-edit', TRACK)
  return { first, tip, work }
}

/** 流程工具的 start 为本检出写的 task context；这里只给钩子读的字段。 */
function bind(root: string, taskBase: string, targetBase: string): void {
  // 和流程工具一样从 git 的顶层目录取真实路径：Windows 的临时目录是 8.3 短名，
  // 对它直接 realpath 不会展开成 git 回的长名。
  const actual = realpathSync(git(root, 'rev-parse', '--show-toplevel'))
  writeFileSync(
    taskContextPath(root),
    JSON.stringify({
      schemaVersion: 1,
      root: actual,
      gitDir: realpathSync(join(actual, '.git')),
      branch: git(root, 'branch', '--show-current'),
      targetBase,
      tasks: [],
      ownerTask: {
        issue: { url: 'https://github.com/owner/repo/issues/1' },
        revision: 1,
        attempt: 'one',
        taskBase,
        writeScope: ['packages'],
      },
      operation: null,
    }),
  )
}

describe('收工钩子在没有 task context 时的基线', { timeout: 60_000 }, () => {
  it('从 main 分出的分支：基线是与 main 的合并点，即使登记了更远的活跃轨道', () => {
    const root = trunk()
    git(root, 'branch', TRACK, git(root, 'rev-list', '--max-parents=0', 'HEAD'))
    const fork = git(root, 'rev-parse', 'HEAD')
    git(root, 'checkout', '-q', '-b', 'someone/work')
    edit(root, 'work')
    expect(touchedBase(root, 'main')).toBe(fork)
  })

  it('从活跃轨道分出并合入过轨道尖端：基线是与轨道尖端的合并点，轨道相对 main 的改动不进变更', () => {
    const root = trunk()
    const { tip } = branchedFromTrack(root)
    const base = touchedBase(root, 'main')
    expect(base).toBe(tip)
    expect(changedFiles(root, base ?? 'HEAD')).toEqual(['packages/core/a/src/work.ts'])
  })

  it('远端跟踪的轨道分支优先于同名本地分支', () => {
    const root = trunk()
    const { tip } = branchedFromTrack(root)
    // 本地轨道分支落后；远端跟踪的才是已经合入的尖端。
    git(root, 'update-ref', `refs/remotes/origin/${TRACK}`, tip)
    git(root, 'branch', '-f', TRACK, git(root, 'rev-parse', `${tip}~1`))
    expect(touchedBase(root, 'main')).toBe(tip)
  })

  /** 轨道登记带 `transport`（或不带），远端跟踪的轨道分支落在 `location` 下；本地轨道分支落后一个提交。 */
  function trackedAt(transport: object, location: string): void {
    const registry = JSON.stringify({
      tracks: [{ id: 'track', branch: TRACK, status: 'active' }],
      ...transport,
    })
    const root = trunk(registry)
    const { tip } = branchedFromTrack(root)
    git(root, 'update-ref', `refs/remotes/${location}/${TRACK}`, tip)
    git(root, 'branch', '-f', TRACK, git(root, 'rev-parse', `${tip}~1`))
    expect(touchedBase(root, 'main')).toBe(tip)
  }

  it('policy 写了 transport.location：远端跟踪分支按该位置找', () => {
    trackedAt({ transport: { kind: 'remote', location: 'upstream' } }, 'upstream')
  })

  it('policy 没写 transport，位置取 origin：远端跟踪分支按该位置找', () => {
    trackedAt({}, 'origin')
  })

  it('与主线和轨道一样近时取主线', () => {
    const root = trunk()
    const fork = git(root, 'rev-parse', 'HEAD')
    git(root, 'checkout', '-q', '-b', TRACK)
    edit(root, 'trackSide')
    git(root, 'checkout', '-q', 'main')
    edit(root, 'mainSide')
    const mainTip = git(root, 'rev-parse', 'HEAD')
    git(root, 'checkout', '-q', '-b', 'someone/work')
    git(root, 'merge', '-q', '--no-edit', TRACK)
    const distance = (ref: string) => git(root, 'rev-list', '--count', `${ref}..HEAD`)
    expect(distance(mainTip)).toBe(distance(TRACK))
    expect(touchedBase(root, 'main')).toBe(mainTip)
    expect(mainTip).not.toBe(fork)
  })

  it('轨道不是 active 时不当候选：基线回到与 main 的合并点', () => {
    const root = trunk(policy('retiring'))
    const fork = git(root, 'rev-parse', 'HEAD')
    branchedFromTrack(root)
    expect(touchedBase(root, 'main')).toBe(fork)
  })

  /** 轨道登记的内容读不懂：钩子不出错，基线退回只用 primaryBranch 求的合并点。 */
  function unreadableRegistry(text: string): void {
    const root = trunk(text)
    const fork = git(root, 'rev-parse', 'HEAD')
    branchedFromTrack(root)
    expect(touchedBase(root, 'main')).toBe(fork)
  }

  it('登记文件不是合法的 JSON：钩子不出错，基线退回只用 primaryBranch 求的合并点', () => {
    unreadableRegistry('{not json')
  })

  it('登记里没有 tracks 数组：钩子不出错，基线退回只用 primaryBranch 求的合并点', () => {
    unreadableRegistry(JSON.stringify({ tracks: 'integration/track' }))
  })

  it('轨道条目不是对象：钩子不出错，基线退回只用 primaryBranch 求的合并点', () => {
    unreadableRegistry(JSON.stringify({ tracks: [null, 'x', 3] }))
  })

  it('HEAD 里没有轨道登记文件：基线退回与 main 的合并点', () => {
    const root = repository()
    write(root, 'packages/core/a/src/index.ts', 'export const a = 1\n')
    const fork = commit(root, 'member')
    git(root, 'checkout', '-q', '-b', 'someone/work')
    edit(root, 'work')
    expect(touchedBase(root, 'main')).toBe(fork)
  })

  it('候选一个也求不出（没有 primaryBranch 这个分支）：只看未提交的改动', () => {
    const root = trunk()
    git(root, 'checkout', '-q', '-b', 'someone/work')
    edit(root, 'committed')
    expect(touchedBase(root, 'nonexistent')).toBeUndefined()
    write(root, 'packages/core/a/src/uncommitted.ts', 'export const u = 1\n')
    expect(touchedBase(root, 'nonexistent')).toBe('HEAD')
  })

  it('有 task context：仍用 taskBase，不看轨道登记', () => {
    const root = trunk()
    const { first, tip } = branchedFromTrack(root)
    bind(root, first, tip)
    expect(touchedBase(root, 'main')).toBe(first)
  })
})

describe('成员发现与变异沙箱', { timeout: 60_000 }, () => {
  /** 一个成员，加上变异运行器留下的、被 git 忽略的同名副本（未提交）。 */
  function sandboxed(): string {
    const root = repository()
    write(root, '.gitignore', '.stryker-tmp*\n')
    write(root, 'pnpm-workspace.yaml', 'packages:\n  - packages/*/*\n')
    write(root, 'packages/core/a/package.json', JSON.stringify({ name: '@example/a' }))
    write(root, 'packages/core/a/src/index.ts', 'export const a = 1\n')
    commit(root, 'member')
    git(root, 'checkout', '-q', '-b', 'someone/work')
    const manifest = JSON.stringify({ name: '@example/a' })
    write(root, 'packages/.stryker-tmp-x/sandbox-y/package.json', manifest)
    write(root, 'packages/.stryker-tmp-x/sandbox-y/src/index.ts', 'export const copy = 1\n')
    return root
  }

  it('被 git 忽略的目录里的 package.json 不算成员：照常发现成员、不报重名', () => {
    const root = sandboxed()
    expect(readArchitectureSource(root).members.map(member => member.path)).toEqual([
      'packages/core/a',
    ])
  })

  it('只有目录里个别文件被忽略时目录仍是成员：忽略要匹配目录自身才排除', () => {
    const root = sandboxed()
    write(root, '.gitignore', '.stryker-tmp*\npackages/core/b/package.json\n')
    write(root, 'packages/core/b/package.json', JSON.stringify({ name: '@example/b' }))
    expect(readArchitectureSource(root).members.map(member => member.path)).toEqual([
      'packages/core/a',
      'packages/core/b',
    ])
  })

  // 被忽略且未跟踪的目录只存在于某个本地检出，干净检出与 CI 上没有它，所以不算成员——
  // 即使 pnpm 在本地会把它当成员。已跟踪的文件 git 从不当作被忽略，提交过的成员不受影响。
  /** 一个成员，加上被 `.gitignore` 忽略、非点开头的未跟踪目录 `packages/core/scratch`，里面放 `manifest`。 */
  function scratched(manifest: string): string {
    const root = repository()
    write(root, '.gitignore', 'scratch/\n')
    write(root, 'pnpm-workspace.yaml', 'packages:\n  - packages/*/*\n')
    write(root, 'packages/core/a/package.json', JSON.stringify({ name: '@example/a' }))
    write(root, 'packages/core/a/src/index.ts', 'export const a = 1\n')
    commit(root, 'member')
    write(root, 'packages/core/scratch/package.json', manifest)
    return root
  }

  it('被 git 忽略且未跟踪的非点开头目录不算成员：即使它有合法的 package.json', () => {
    // 缺陷：成员发现只照 pnpm 的目录树，把本地才有的 scratch 当成员，成员集随检出而变。
    const root = scratched(JSON.stringify({ name: '@example/scratch' }))
    expect(readArchitectureSource(root).members.map(member => member.path)).toEqual([
      'packages/core/a',
    ])
  })

  it('被忽略的非点开头目录里的 package.json 不合法：成员发现照常完成、不抛错', () => {
    // 缺陷：membersOf 校验了被忽略目录里的 manifest，一个不合法的本地产物让整个成员发现失败。
    const root = scratched('{}')
    expect(readArchitectureSource(root).members.map(member => member.path)).toEqual([
      'packages/core/a',
    ])
  })

  it('目录里只有被忽略的 log 文件：check-ignore 一个也不匹配，该目录不是被忽略目录', () => {
    // 缺陷：把 check-ignore 退出码 1（一个也不匹配）当成出错，整个成员发现与依赖图随之抛出。
    const root = repository()
    write(root, '.gitignore', '*.log\n')
    write(root, 'pnpm-workspace.yaml', 'packages:\n  - packages/*/*\n')
    write(root, 'packages/core/a/package.json', JSON.stringify({ name: '@example/a' }))
    commit(root, 'member')
    write(root, 'packages/core/logs/run.log', 'output\n')
    expect(ignoredDirectories(root)).toEqual(new Set())
    expect(readArchitectureSource(root).members.map(member => member.path)).toEqual([
      'packages/core/a',
    ])
  })

  it('有变异沙箱时钩子的读数照常量出，不因重名放弃', () => {
    const root = sandboxed()
    edit(root, 'work')
    const base = touchedBase(root, 'main')
    expect(base).toBeDefined()
    const readings = measureForHook(root, base ?? 'HEAD', readLoopConfig(), readMetricsConfig())
    expect(readings.explain.conformance?.status).toBe('data')
  })
})
