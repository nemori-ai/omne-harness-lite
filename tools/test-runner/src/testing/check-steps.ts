import type { CheckStep, Command } from './check-graph.ts'
import { pnpmCommand } from './support.ts'

export const PLAN_DIR = 'tmp/check-plan'
export const PLAN_FILE = `${PLAN_DIR}/plan.json`

export interface StepInputs {
  readonly runnerCli: string
  readonly devFlowIntegrationCli: string
}

export function checkSteps(inputs: StepInputs): CheckStep[] {
  const node = (script: string, ...args: string[]): Command => [
    process.execPath,
    '--experimental-strip-types',
    script,
    ...args,
  ]
  const pnpm = pnpmCommand()
  const run = (...args: string[]): Command => [pnpm.command, ...pnpm.args, 'run', ...args]
  const step = (name: string, after: string[] = []): CheckStep => ({
    name,
    command: node(inputs.runnerCli, 'step', name, '--plan', PLAN_FILE),
    after,
    heavy: true,
    planned: true,
  })
  const resident = (name: string, after: string[] = []): CheckStep => ({
    name,
    command: run('--silent', name),
    after,
    heavy: false,
  })
  return [
    resident('check:agents'),
    resident('check:docs'),
    resident('check:design'),
    resident('acceptance:lock'),
    { ...step('python'), heavy: false },
    { name: 'format:check', command: run('format:check'), after: [], heavy: false },
    step('build'),
    // 读 dist 的步骤都排在 typecheck 之后：有成员的 typecheck 会重建自己的 dist，同时读会读到半写的产物。
    {
      name: 'check:declarations',
      command: run('check:declarations'),
      after: ['build', 'typecheck'],
      heavy: false,
    },
    {
      name: 'contract-check',
      command: node(inputs.devFlowIntegrationCli, 'contract-check'),
      after: ['build', 'typecheck'],
      heavy: false,
    },
    step('typecheck', ['build']),
    step('test', ['build']),
    { name: 'lint:rules', command: run('lint:rules'), after: ['build', 'typecheck'], heavy: false },
    {
      name: 'lint:oxlint',
      command: run('lint:oxlint'),
      after: ['build', 'typecheck'],
      heavy: false,
    },
    { name: 'lint:deps', command: run('lint:deps'), after: ['build', 'typecheck'], heavy: false },
    step('acceptance', ['build']),
  ]
}

export function preflightSteps(): CheckStep[] {
  const pnpm = pnpmCommand()
  const run = (...args: string[]): Command => [pnpm.command, ...pnpm.args, 'run', ...args]
  const light = (name: string, ...args: string[]): CheckStep => ({
    name,
    command: run('--silent', name, ...args),
    after: [],
    heavy: false,
  })
  return [
    light('check:agents'),
    light('check:docs'),
    light('check:design'),
    light('format:check'),
    light('lint:rules'),
    light('lint:oxlint'),
    light('acceptance:lock'),
  ]
}

export const PREFLIGHT_FIXES: Readonly<Record<string, string>> = {
  'check:agents':
    '投影与源不一致：按 .meta_harness/tooling/README.md 重新生成（多出的、退役的生成物一并删掉）；不手改根目录的投影',
  'check:docs': '按日志修链接、锚点与必要章节；规则见 docs/engineering/documentation.md',
  'check:design':
    '按日志修设计材料的结构与登记；需要 uv 锁文件一致（UV_DEFAULT_INDEX 指向镜像时先 unset）',
  'format:check':
    'pnpm run format:write；CRLF 工作副本已由预检开头自愈，仍报的文件看是不是有内容改动',
  'lint:rules':
    '按日志修结构规则（tools/product-checks）；报「找不到 dist」时先 pnpm run build --filter @omne-harness/legal-identity',
  'lint:oxlint': 'pnpm run lint:oxlint 看逐条；改代码，不加 disable 指令绕过',
  'acceptance:lock': '验收锁不一致：按 tools/repo-toolchain/README_ZH.md 的验收锁一节更新或回退',
}

export function residentStepNames(steps: readonly CheckStep[]): string[] {
  return steps.filter(step => step.planned !== true).map(step => step.name)
}

export function describeSteps(steps: readonly CheckStep[]): string[] {
  return steps.map(
    step =>
      `${step.name}\t${step.after.join(',') || '-'}\t${step.heavy ? 'heavy' : 'light'}\t${step.command.join(' ')}`,
  )
}
