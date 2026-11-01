// 预检 `check --preflight`：只跑不依赖构建与全量测试的轻步骤，全部同时起、失败不终止其余，最后一次列出全部发现与修法；
// 不写准入日志与运行记录（它不是准入证据）。步骤换成假命令，与 check-graph.spec.ts 同一种夹具。
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { repositoryEnv } from '@omne-harness/repo-toolchain/core/git-environment'
import { ADMISSION_RECORD_DIR, CHECK_RUN_RECORD_DIR } from '../src/testing/admission-run.ts'
import type { CheckStep } from '../src/testing/check-graph.ts'
import { preflightSteps, PREFLIGHT_FIXES } from '../src/testing/check-steps.ts'
import { PREFLIGHT_LOG_DIR, runPreflight } from '../src/testing/preflight.ts'

let root: string
const printed: string[] = []
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-preflight-')))
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, env: repositoryEnv(process.env), encoding: 'utf8' })
  git('init', '-q', '-b', 'main')
  git('config', 'core.autocrlf', 'input')
  writeFileSync(join(root, '.gitignore'), 'tmp/\n')
  writeFileSync(join(root, 'a.txt'), 'one\n')
  git('add', '-A')
  git('-c', 'user.name=P', '-c', 'user.email=p@example.invalid', 'commit', '-qm', 'base')
  printed.length = 0
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    printed.push(args.map(String).join(' '))
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(root, { recursive: true, force: true })
})

/** 一步：睡 `ms` 毫秒、打印一行、以 `code` 退出。 */
const step = (name: string, ms: number, code = 0): CheckStep => ({
  name,
  command: [
    process.execPath,
    '-e',
    `setTimeout(() => { console.log(${JSON.stringify(`${name} 的发现`)}); process.exit(${code}) }, ${ms})`,
  ],
  after: [],
  heavy: false,
})

const noInstall = { install: () => ({ status: 0, output: '' }) }

describe('预检', () => {
  it('两步失败、一步慢：全部跑完，最后一次列出两处失败、各自的日志末尾与修法；退出码取第一个失败', async () => {
    const code = await runPreflight(root, {
      steps: () => [step('ok', 20), step('bad-a', 50, 3), step('bad-b', 700, 4)],
      fixes: { 'bad-a': '修法 A', 'bad-b': '修法 B' },
      environment: noInstall,
      cores: 24,
    })
    expect(code).toBe(3)
    const text = printed.join('\n')
    expect(text).toContain('预检：2 项失败')
    expect(text).toMatch(/✗ bad-a .*退出码 3/u)
    expect(text).toMatch(/✗ bad-b .*退出码 4/u)
    // bad-b 比 bad-a 晚 650 毫秒才失败：失败不终止其余，它跑完了、不是被终止。
    expect(text).not.toContain('被终止')
    expect(text).toContain('bad-a 的发现')
    expect(text).toContain('bad-b 的发现')
    expect(text).toContain('修法 A')
    expect(text).toContain('修法 B')
    expect(existsSync(join(root, PREFLIGHT_LOG_DIR, 'bad-a.log'))).toBe(true)
    // 不是准入证据：没有准入日志、没有运行记录。
    expect(existsSync(join(root, ADMISSION_RECORD_DIR))).toBe(false)
    expect(existsSync(join(root, CHECK_RUN_RECORD_DIR))).toBe(false)
  })

  it('全部通过：退出 0，写明通过与墙钟；环境自检的结果也在输出里', async () => {
    const code = await runPreflight(root, {
      steps: () => [step('ok', 10), step('fine', 10)],
      fixes: {},
      environment: noInstall,
    })
    expect(code).toBe(0)
    const text = printed.join('\n')
    expect(text).toContain('预检通过')
    expect(text).toContain('环境自检：')
  })

  it('依赖离线安装失败：不跑步骤，以 2 退出', async () => {
    writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const code = await runPreflight(root, {
      steps: () => [step('never', 10)],
      fixes: {},
      environment: { install: () => ({ status: 1, output: 'offline miss' }) },
    })
    expect(code).toBe(2)
    expect(existsSync(join(root, PREFLIGHT_LOG_DIR, 'never.log'))).toBe(false)
  })
})

describe('预检的步骤表', () => {
  const inputs = {
    baseline: 'main',
    runnerCli: 'runner.ts',
    devFlowDeliveryCli: 'delivery.ts',
    devFlowIntegrationCli: 'integration.ts',
  }

  it('只有不依赖构建与全量测试的轻步骤，彼此无依赖；每一步都有修法', () => {
    const steps = preflightSteps(inputs)
    expect(steps.map(step => step.name)).toEqual([
      'check:agents',
      'check:docs',
      'check:design',
      'check:lines',
      'change-scope',
      'format:check',
      'lint:rules',
      'lint:oxlint',
      'acceptance:lock',
    ])
    for (const step of steps) {
      expect(step.after, step.name).toEqual([])
      expect(step.heavy, step.name).toBe(false)
      expect(step.planned, step.name).toBeUndefined()
      expect(PREFLIGHT_FIXES[step.name], step.name).toBeTruthy()
    }
    // 写范围核对直接起 dev-flow 的入口，与 check 的表相同。
    expect(steps.find(step => step.name === 'change-scope')?.command).toContain('delivery.ts')
  })
})
