// 覆盖采集读 test-runner 的计划文件：只认形状对、且是对当前提交算的计划；入口的参数组合。
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { parseMetricsPlan, readMetricsPlan } from '../src/metrics/plan.ts'

const CLI = fileURLToPath(new URL('../src/metrics/cli.ts', import.meta.url))
const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function repository(): { root: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), 'omne-metrics-plan-'))
  roots.push(root)
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  git('init', '-q')
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--allow-empty', '-qm', 'base')
  return { root, head: git('rev-parse', 'HEAD').trim() }
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
