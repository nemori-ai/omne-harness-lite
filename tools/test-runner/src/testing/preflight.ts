// 预检 `check --preflight`（根脚本 `pnpm run preflight`）：写者收尾与调度者入队前跑，把准入里不依赖构建与全量测试的步骤
// 在当前树上一次跑完——步骤表在 check-steps.ts 的 `preflightSteps`，全部同时起（受轻步骤并发限制），失败不终止其余
// （等价 --keep-going），最后一次列出全部发现与修法。开始时同样自检并自愈环境（environment.ts）。
// 它不是准入证据：不写准入日志、不写运行记录，日志只落 `tmp/preflight/`。
import { availableParallelism } from 'node:os'
import { join, relative } from 'node:path'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { lightConcurrency, STEP_INPUTS } from './check.ts'
import { runGraph, type CheckStep } from './check-graph.ts'
import { PREFLIGHT_FIXES, preflightSteps, type StepInputs } from './check-steps.ts'
import { describeHealing, healEnvironment, type EnvironmentIo } from './environment.ts'

export const PREFLIGHT_LOG_DIR = 'tmp/preflight'
const TAIL_LINES = 20

/** 子进程不继承的 git 环境，与 check.ts 相同。 */
const GIT_ENV = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_NAMESPACE',
  'GIT_SHALLOW_FILE',
]

/** 可替换的依赖：步骤表、修法表、环境自愈的外部动作与核数。测试换成假步骤。 */
export interface PreflightDependencies {
  readonly steps?: (inputs: StepInputs) => CheckStep[]
  readonly fixes?: Readonly<Record<string, string>>
  readonly environment?: EnvironmentIo
  readonly cores?: number
}

const seconds = (ms: number) => (ms / 1000).toFixed(1)

function tail(path: string, lines: number): string[] {
  try {
    return readFileSync(path, 'utf8').trimEnd().split('\n').slice(-lines)
  } catch {
    return []
  }
}

export async function runPreflight(
  root: string,
  dependencies: PreflightDependencies = {},
): Promise<number> {
  const say = (line: string) => console.log(line)
  const healed = healEnvironment(root, dependencies.environment)
  if (healed.dependencies.status === 'install-failed') {
    for (const line of describeHealing(healed)) console.error(line)
    console.error('依赖目录与锁文件不一致且离线安装失败：预检不跑任何步骤')
    return 2
  }
  for (const line of describeHealing(healed)) say(line)

  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const name of GIT_ENV) delete env[name]
  const cores = dependencies.cores ?? availableParallelism()
  const steps = (dependencies.steps ?? preflightSteps)({ ...STEP_INPUTS, baseline: 'HEAD' })
  const fixes = dependencies.fixes ?? PREFLIGHT_FIXES
  const logDir = join(root, PREFLIGHT_LOG_DIR)
  rmSync(logDir, { recursive: true, force: true })
  mkdirSync(logDir, { recursive: true })
  say(
    `预检：${steps.length} 步同时跑（轻步骤同时至多 ${lightConcurrency(cores)} 个；失败不终止其余）；日志在 ${PREFLIGHT_LOG_DIR}/；不写准入日志与运行记录`,
  )
  const run = await runGraph(steps, {
    root,
    logDir,
    env,
    lightConcurrency: lightConcurrency(cores),
    keepGoing: true,
    onStart: step => say(`▶ ${step.name}`),
    onFinish: result => {
      const took = `${seconds(result.endedMs - result.startedMs)} 秒`
      const why = result.reason === undefined ? '' : `，${result.reason}`
      if (result.cancelled) say(`⊘ ${result.name} 被终止（${took}${why}）`)
      else if (result.exitCode === 0) say(`✓ ${result.name} ${took}`)
      else say(`✗ ${result.name} ${took}，退出码 ${result.exitCode}${why}`)
    },
  })
  const failed = run.results
    .filter(result => result.exitCode !== 0 && !result.cancelled)
    .sort((a, b) => a.endedMs - b.endedMs)
  if (failed.length === 0) {
    say(`预检通过：${steps.length} 步全部退出 0，总计 ${seconds(run.wallMs)} 秒`)
    return 0
  }
  say(`预检：${failed.length} 项失败，总计 ${seconds(run.wallMs)} 秒`)
  for (const result of failed) {
    say(
      `--- ${result.name}（退出码 ${result.exitCode}，日志 ${relative(root, result.logPath).replaceAll('\\', '/')}）---`,
    )
    for (const line of tail(result.logPath, TAIL_LINES)) say(`  ${line}`)
    say(`  修法：${fixes[result.name] ?? '看日志'}`)
  }
  const first = failed[0]
  return first !== undefined && first.exitCode > 0 ? first.exitCode : 1
}
