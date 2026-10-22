// 覆盖采集读 test-runner 的计划文件：只认形状对、且是对当前提交算的计划；按计划选覆盖成员；入口的参数组合。
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  coverageTargets,
  parseMetricsPlan,
  readMetricsPlan,
  unplannedMembers,
} from '../src/metrics/plan.ts'
import {
  commit,
  git,
  removeTemporaries,
  repository as fixtureRepository,
  temporaryDirectory,
  write,
} from './fixtures/loop-canary/repository.ts'

const CLI = fileURLToPath(new URL('../src/metrics/cli.ts', import.meta.url))
const REPOSITORY_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
afterEach(removeTemporaries)

function repository(): { root: string; head: string } {
  const root = temporaryDirectory('omne-metrics-plan-')
  git(root, 'init', '-q')
  git(root, 'commit', '--allow-empty', '-qm', 'base')
  return { root, head: git(root, 'rev-parse', 'HEAD') }
}
const planOf = (head: string, test: unknown = ['packages/a']) => ({
  head,
  dirty: false,
  base: { ref: 'origin/main', mergeBase: 'b'.repeat(40) },
  plan: { mode: 'scoped', reason: '', test },
})

describe('计划文件', () => {
  it('取基线、合并点与要跑测试的成员；缺栏或类型不对就不认', () => {
    expect(parseMetricsPlan(planOf('a'.repeat(40)))).toEqual({
      head: 'a'.repeat(40),
      base: { ref: 'origin/main', mergeBase: 'b'.repeat(40) },
      test: ['packages/a'],
    })
    expect(parseMetricsPlan(planOf('a', 'packages/a'))).toBeUndefined()
    expect(parseMetricsPlan({ ...planOf('a'), base: { ref: 'x' } })).toBeUndefined()
    expect(parseMetricsPlan(null)).toBeUndefined()
  })

  it('不是对当前提交算的计划被拒绝', () => {
    const { root, head } = repository()
    const path = join(root, 'plan.json')
    writeFileSync(path, JSON.stringify(planOf(head)))
    expect(readMetricsPlan(root, path).test).toEqual(['packages/a'])
    writeFileSync(path, JSON.stringify(planOf('0'.repeat(40))))
    expect(() => readMetricsPlan(root, path)).toThrow('重新算计划')
    writeFileSync(path, '{')
    expect(() => readMetricsPlan(root, path)).toThrow('读不出计划文件')
  })
})

describe('覆盖成员', () => {
  it('只取计划里要跑测试、又在配置根目录下的成员，去重并保持出现顺序', () => {
    const plan = {
      head: 'a',
      base: { ref: 'r', mergeBase: 'm' },
      test: ['packages/a', 'apps/b', 'examples/c'],
    }
    expect(
      coverageTargets(
        ['apps/b', undefined, 'packages/a', 'packages/z', 'examples/c', 'apps/b'],
        plan,
        ['packages', 'apps'],
      ),
    ).toEqual(['apps/b', 'packages/a'])
  })

  it('改动文件按最长的成员目录前缀归属；在配置根目录下却不在计划里的成员被点出来', () => {
    const plan = { head: 'a', base: { ref: 'r', mergeBase: 'm' }, test: ['packages/g/a'] }
    const members = [
      { path: 'packages/g/a' },
      { path: 'packages/g/b' },
      { path: 'packages/g/b/inner' },
      { path: 'tools/t' },
    ]
    const files = [
      'packages/g/a/src/x.ts',
      'packages/g/b/src/y.ts',
      'packages/g/b/inner/src/z.ts',
      'packages/g/b/src/y.ts',
      'tools/t/src/w.ts',
    ]
    expect(unplannedMembers(files, plan, ['packages', 'apps'], members)).toEqual([
      'packages/g/b',
      'packages/g/b/inner',
    ])
    expect(unplannedMembers(files, plan, ['packages', 'tools'], members)).toEqual([
      'packages/g/b',
      'packages/g/b/inner',
      'tools/t',
    ])
  })

  it('组根文件没有成员前缀，不算改过的成员；目录名只是前缀相同的也不算', () => {
    const plan = { head: 'a', base: { ref: 'r', mergeBase: 'm' }, test: [] }
    const members = [{ path: 'packages/g/a' }]
    const files = [
      'packages/g/README.md',
      'packages/g/docs/architecture.md',
      'packages/g/a-extra/src/x.ts',
    ]
    expect(unplannedMembers(files, plan, ['packages'], members)).toEqual([])
  })
})

describe('--coverage 前的计划外检查（入口，真实文件树）', () => {
  function workspace(): string {
    const root = fixtureRepository()
    write(root, 'pnpm-workspace.yaml', "packages:\n  - 'packages/*/*'\n")
    for (const name of ['x', 'y'])
      write(root, `packages/g/${name}/package.json`, `{ "name": "@fx/${name}" }\n`)
    write(root, 'packages/g/x/src/index.ts', 'export const x = 1\n')
    write(root, 'packages/g/y/src/index.ts', 'export const y = 1\n')
    write(root, 'packages/g/docs/architecture.md', 'before\n')
    commit(root, 'workspace')
    return root
  }
  function runCoverage(root: string, changes: Record<string, string>) {
    const mergeBase = git(root, 'rev-parse', 'HEAD')
    for (const [path, text] of Object.entries(changes)) write(root, path, text)
    const head = commit(root, 'change')
    const plan = join(temporaryDirectory('omne-metrics-plan-file-'), 'plan.json')
    writeFileSync(plan, JSON.stringify({ ...planOf(head, []), base: { ref: 'main', mergeBase } }))
    return spawnSync(
      process.execPath,
      ['--experimental-strip-types', CLI, '--plan', plan, '--coverage', '--out', join(root, 'out')],
      {
        encoding: 'utf8',
        env: { ...process.env, OMNE_SUBJECT_ROOT: root, OMNE_RUNNER_ROOT: REPOSITORY_ROOT },
      },
    )
  }

  // 归慢层：子进程：在临时 git 仓库里起度量入口 CLI 子进程，它读依赖图与实际架构。
  it('只改组根文档时不报计划外的成员', { tags: ['slow'] }, () => {
    const result = runCoverage(workspace(), { 'packages/g/docs/architecture.md': 'after\n' })
    expect(result.stderr).not.toContain('计划外的成员')
    expect(result.status).toBe(0)
  })

  // 归慢层：子进程：同上。
  it('真实成员改了却不在计划里仍然报，且不连带组根', { tags: ['slow'] }, () => {
    const result = runCoverage(workspace(), {
      'packages/g/docs/architecture.md': 'after\n',
      'packages/g/y/src/index.ts': 'export const y = 2\n',
    })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('计划之后工作树改了计划外的成员：packages/g/y：重新算计划')
  })
})

describe('入口的参数', () => {
  const run = (...args: string[]) =>
    spawnSync(process.execPath, ['--experimental-strip-types', CLI, ...args], { encoding: 'utf8' })

  it('--coverage 要给 --plan；--plan 与 --base 不能同时给', () => {
    const coverage = run('--coverage')
    expect(coverage.status).not.toBe(0)
    expect(coverage.stderr).toContain('--coverage 要给 --plan')
    const both = run('--plan', 'plan.json', '--base', 'main')
    expect(both.status).not.toBe(0)
    expect(both.stderr).toContain('--base 与 --plan 不能同时给')
  })
})
