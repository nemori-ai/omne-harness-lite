// 差分变异入口的参数：范围参数互斥、点名成员只列范围、缺省基线现算计划、读准入检查的计划。
import { execFileSync, spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CLI, cliAt, cliFixture, writePlan } from './fixtures/mutation.ts'

const cliRoot = cliFixture()
const cli = (...args: string[]) => cliAt(cliRoot, ...args)

describe('入口的参数', () => {
  // 归慢层：起变异入口 CLI 子进程。全量准入快层账本里这条 2.7 秒，超过单条预算 2.5 秒（负载下 7.1 秒）（tools/test-runner/README_ZH.md「归层」）。
  it('--base、--plan 与 --members 只能给一个；不是产品成员的拒绝', { tags: ['slow'] }, () => {
    expect(cli('run', '--base', 'HEAD', '--members', 'apps/cli', '--plan-only').status).toBe(2)
    expect(cli('run', '--plan', 'plan.json', '--base', 'HEAD', '--plan-only').status).toBe(2)
    expect(cli('run', '--plan', 'plan.json', '--members', 'apps/cli', '--plan-only').status).toBe(2)
    const tool = cli('run', '--members', 'tools/repo-toolchain', '--plan-only')
    expect(tool.status).toBe(2)
    expect(tool.stderr).toContain('只变异产品源码')
    expect(cli('run', '--members', 'packages/core/nope', '--plan-only').stderr).toContain(
      '不是带测试的 workspace 成员',
    )
  })

  it('点名成员只列范围：写明跑快层', () => {
    const planned = cli('run', '--members', 'packages/core/canary', '--plan-only')
    expect(planned.status, planned.stderr).toBe(0)
    expect(planned.stdout).toContain('只跑快层（vitest 的 mode 为 fast）')
    expect(planned.stdout).toMatch(/packages\/core\/canary：1 个文件/u)
  })

  // 缺省基线：按统一规则取（任务上下文固定的基线，再取 origin/main，最后取 main），与 test:affected 相同。
  it('不给范围时按缺省基线在本仓库现算计划', { tags: ['slow'], timeout: 120_000 }, () => {
    const ran = spawnSync(
      process.execPath,
      ['--experimental-strip-types', CLI, 'run', '--plan-only'],
      { encoding: 'utf8' },
    )
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.stdout).toMatch(/变异范围：基线 |没有可变异的改动：基线 /u)
  })

  // 归慢层：在临时 git 仓库里起变异入口 CLI 子进程。全量准入快层账本里这条 2.2 秒，负载下 5.8 秒，负载下超过单条预算 2.5 秒（tools/test-runner/README_ZH.md「归层」）。
  it(
    '--plan 读准入检查的计划：变异计划里的成员；有计划外的改动、或计划不是当前提交算的就拒绝',
    { tags: ['slow'] },
    () => {
      const root = cliFixture()
      writeFileSync(join(root, 'packages/core/canary/src/index.ts'), 'export const value = 2\n')
      const head = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
      }).trim()
      const planFile = (test: string[], at = head) => writePlan(at, head, test)
      const selected = cliAt(
        root,
        'run',
        '--plan',
        planFile(['packages/core/canary']),
        '--plan-only',
      )
      expect(selected.status, selected.stderr).toBe(0)
      expect(selected.stdout).toMatch(/packages\/core\/canary：1 个文件/u)
      // 计划算完后工作树又改了计划外的成员：不静默跳过，要求重算。
      const outside = cliAt(root, 'run', '--plan', planFile([]), '--plan-only')
      expect(outside.status).toBe(2)
      expect(outside.stderr).toContain('计划外的成员：packages/core/canary')
      const stale = cliAt(root, 'run', '--plan', planFile([], '0'.repeat(40)), '--plan-only')
      expect(stale.status).toBe(2)
      expect(stale.stderr).toContain('重新算计划')
    },
  )
})
