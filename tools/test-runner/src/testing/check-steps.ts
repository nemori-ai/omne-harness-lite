// `pnpm run check` 的步骤表：每一步跑什么、先于它的是谁、重不重。顺序与依赖的含义归 scripts/README.md「check 的步骤图」；
// 这里只把它写成机器能调度的形状。依赖关系与原来串行版本的语义一致：构建之后才跑类型检查、成员测试、验收、
// 声明检查、契约快照核对、lint:rules 与 lint:deps；回路状态最后（让前面的失败先报，并读验收的账本）；其余常驻检查与 pytest
// 不依赖任何步骤。
import type { CheckStep, Command } from './check-graph.ts'
import { pnpmCommand } from './support.ts'

export const PLAN_DIR = 'tmp/check-plan'
export const PLAN_FILE = `${PLAN_DIR}/plan.json`
export const LOOP_STATUS_DIR = 'tmp/loop-status-check'

/** 步骤表的输入：基线与各入口脚本的路径（相对根）。 */
export interface StepInputs {
  readonly baseline: string
  readonly runnerCli: string
  readonly devFlowDeliveryCli: string
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
  const everythingElse = (steps: readonly CheckStep[]) => steps.map(entry => entry.name)
  const steps: CheckStep[] = [
    // 常驻：每次都跑，不依赖任何步骤。
    resident('check:agents'),
    resident('check:docs'),
    resident('check:design'),
    // 线归属表的结构校验（重叠、漏掉的成员、轨道登记与契约位置）。
    resident('check:lines'),
    // 本卡自己的改动须在 binding 写范围与本线内；没有 task context 时只报告「未绑定」。
    { name: 'change-scope', command: node(inputs.devFlowDeliveryCli), after: [], heavy: false },
    // 按计划：Python 工具测试。pytest-xdist 分进程跑，进程数取预算的四分之一（见 .meta_harness/tooling/tests/conftest.py），
    // 与重步骤同时跑而不把机器吃满；仍是轻步骤，不占重步骤那条道。
    { ...step('python'), heavy: false },
    { name: 'format:check', command: run('format:check'), after: [], heavy: false },
    { name: 'test:format', command: run('test:format'), after: [], heavy: false },
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
    { name: 'lint:oxlint', command: run('lint:oxlint'), after: [], heavy: false },
    // dependency-cruiser 解析验收夹具对 dist 的导入。
    { name: 'lint:deps', command: run('lint:deps'), after: ['build', 'typecheck'], heavy: false },
    // 可执行验收驱动构建出来的 dist。
    step('acceptance', ['build']),
  ]
  // 回路状态只读源码、git 与验收账本；放最后让前面的失败先报。
  steps.push({
    name: 'loop:status',
    command: run(
      '--silent',
      'loop:status',
      '--strict',
      '--base',
      inputs.baseline,
      '--out',
      LOOP_STATUS_DIR,
    ),
    after: everythingElse(steps),
    heavy: false,
    clean: [LOOP_STATUS_DIR],
  })
  return steps
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
