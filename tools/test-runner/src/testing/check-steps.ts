import type { CheckStep, Command } from './check-graph.ts'
import { pnpmCommand } from './support.ts'

export const PLAN_DIR = 'tmp/check-plan'
export const PLAN_FILE = `${PLAN_DIR}/plan.json`

/** 步骤表的输入：各入口脚本的路径（相对根）。基线经环境变量 `BASELINE` 交给各步。 */
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
  /** 按计划跑的步骤：经运行器的 `step` 命令，跑不跑、跑哪些成员由计划定。 */
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
    // 常驻：每次都跑，不依赖任何步骤。
    resident('check:agents'),
    resident('check:docs'),
    resident('check:design'),
    // 硬线二：基线（环境变量 BASELINE）以来碰过验收的提交，角色须是验收的拥有者。
    resident('acceptance:lock'),
    // 按计划：Python 工具测试。pytest-xdist 分进程跑，进程数取预算的四分之一（见 .meta_harness/tooling/tests/conftest.py），
    // 与重步骤同时跑而不把机器吃满；仍是轻步骤，不占重步骤那条道。
    { ...step('python'), heavy: false },
    { name: 'format:check', command: run('format:check'), after: [], heavy: false },
    // 按计划：构建被选中的成员及其依赖，加上常驻检查要的成员。
    step('build'),
    // 读 dist 的步骤都排在类型检查之后：有成员的 typecheck 脚本会重建自己的 dist（packages/execution/image），
    // 同时读会读到删掉或写了一半的产物。成员用 TypeScript 7 构建，dist 里的声明要能被 TypeScript 6 读；读的是磁盘上现有的 dist。
    {
      name: 'check:declarations',
      command: run('check:declarations'),
      after: ['build', 'typecheck'],
      heavy: false,
    },
    // 契约成员的 API 快照与现有 dist 核对。
    {
      name: 'contract-check',
      command: node(inputs.devFlowIntegrationCli, 'contract-check'),
      after: ['build', 'typecheck'],
      heavy: false,
    },
    step('typecheck', ['build']),
    // 成员测试：快层通过才跑慢层。
    step('test', ['build']),
    // 结构规则、验收的覆盖声明与提交署名；它导入的成员已在构建里。
    { name: 'lint:rules', command: run('lint:rules'), after: ['build', 'typecheck'], heavy: false },
    {
      name: 'lint:oxlint',
      command: run('lint:oxlint'),
      after: ['build', 'typecheck'],
      heavy: false,
    },
    // dependency-cruiser 解析验收夹具对 dist 的导入。
    { name: 'lint:deps', command: run('lint:deps'), after: ['build', 'typecheck'], heavy: false },
    // 可执行验收驱动构建出来的 dist。
    step('acceptance', ['build']),
  ]
}

/**
 * 预检 `check --preflight` 的步骤表：准入里不依赖构建与全量测试的步骤，全部是轻步骤、彼此无依赖，同时起、失败不终止其余。
 * 与 check 的表同一条命令，判据相同；差别只在这里不跑按计划的步骤，也不跑读 dist 的步骤。
 * `lint:rules` 导入 packages/common/legal-identity 的 dist：预检不构建，读磁盘上现有的；没有就在那一步失败并在修法里写明。
 */
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

/** 预检每一步失败时给人的修法，一句话；详情看那一步的日志。 */
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

/** 常驻步骤名，按表的顺序：计划打印的「常驻」清单与它对账。 */
export function residentStepNames(steps: readonly CheckStep[]): string[] {
  return steps.filter(step => step.planned !== true).map(step => step.name)
}

/** 列出步骤表：名字、依赖、重轻与命令，供 `check --list` 打印与别的成员核对自己有没有接进来。 */
export function describeSteps(steps: readonly CheckStep[]): string[] {
  return steps.map(
    step =>
      `${step.name}\t${step.after.join(',') || '-'}\t${step.heavy ? 'heavy' : 'light'}\t${step.command.join(' ')}`,
  )
}
