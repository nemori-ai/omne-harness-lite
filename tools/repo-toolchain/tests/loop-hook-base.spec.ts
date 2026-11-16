// @module-tag slow
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

const policy = (status: string) =>
  JSON.stringify({
    schemaVersion: 1,
    tracks: [{ id: 'track', branch: TRACK, owner: 'someone', status, initialMain: 'x' }],
    transport: { kind: 'remote', location: 'origin' },
  })

function trunk(policyText: string = policy('active')): string {
  const root = repository()
  write(root, POLICY_PATH, policyText)
  write(root, 'packages/core/a/src/index.ts', 'export const a = 1\n')
  commit(root, 'member and track registry')
  return root
}

function edit(root: string, name: string): string {
  write(root, `packages/core/a/src/${name}.ts`, `export const ${name} = 1\n`)
  return commit(root, name)
}

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

function bind(root: string, taskBase: string, targetBase: string): void {
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
    git(root, 'update-ref', `refs/remotes/origin/${TRACK}`, tip)
    git(root, 'branch', '-f', TRACK, git(root, 'rev-parse', `${tip}~1`))
    expect(touchedBase(root, 'main')).toBe(tip)
  })

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
    const root = scratched(JSON.stringify({ name: '@example/scratch' }))
    expect(readArchitectureSource(root).members.map(member => member.path)).toEqual([
      'packages/core/a',
    ])
  })

  it('被忽略的非点开头目录里的 package.json 不合法：成员发现照常完成、不抛错', () => {
    const root = scratched('{}')
    expect(readArchitectureSource(root).members.map(member => member.path)).toEqual([
      'packages/core/a',
    ])
  })

  it('目录里只有被忽略的 log 文件：check-ignore 一个也不匹配，该目录不是被忽略目录', () => {
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
