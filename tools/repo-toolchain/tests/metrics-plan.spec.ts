// 覆盖采集读 test-runner 的计划文件：只认形状对、且是对当前提交算的计划；按计划选覆盖成员；入口的参数组合。
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { memberOf } from '../src/deps/graph.ts'
import {
  coverageTargets,
  parseMetricsPlan,
  readMetricsPlan,
  unplannedMembers,
} from '../src/metrics/plan.ts'
import { git, removeTemporaries, temporaryDirectory } from './fixtures/loop-canary/repository.ts'

const CLI = fileURLToPath(new URL('../src/metrics/cli.ts', import.meta.url))
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

  it('有改动、在配置根目录下却不在计划里的真实成员被点出来', () => {
    const plan = { head: 'a', base: { ref: 'r', mergeBase: 'm' }, test: ['packages/a'] }
    const members = new Set(['packages/a', 'packages/y', 'tools/t'])
    expect(
      unplannedMembers(
        ['packages/a', 'packages/y', undefined, 'tools/t', 'packages/y'],
        plan,
        ['packages', 'apps'],
        members,
      ),
    ).toEqual(['packages/y'])
  })

  it('组根文档的路径映射出的目录不是工作区成员，不报', () => {
    const plan = { head: 'a', base: { ref: 'r', mergeBase: 'm' }, test: ['packages/a/x'] }
    const members = new Set(['packages/a/x', 'packages/a/y'])
    expect(
      unplannedMembers(
        ['packages/a/x', memberOf('packages/a/docs/architecture.md')?.path],
        plan,
        ['packages'],
        members,
      ),
    ).toEqual([])
    expect(
      unplannedMembers(['packages/a/y', 'packages/a/docs'], plan, ['packages'], members),
    ).toEqual(['packages/a/y'])
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
