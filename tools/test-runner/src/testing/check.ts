// `pnpm run check` 的正文：取基线、算计划、按步骤图跑全部检查，写逐步耗时表；准入模式另写准入日志。
// 运行名额由 scripts/check.sh 先取；这里不排队。
import { resolveBaseline } from '@omne-harness/repo-toolchain/core/task-context'
import { coordinates } from '@omne-harness/repo-toolchain/core/git'
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { join, relative } from 'node:path'
import { runGraph, type CheckStep, type StepResult } from './check-graph.ts'
import { checkSteps, describeSteps, PLAN_DIR, PLAN_FILE } from './check-steps.ts'
import { computePlan, describePlanFile, fullRequested, writePlanFile } from './steps.ts'
import { timestamp } from './support.ts'
import { admissionRequested } from './turbo.ts'

export const CHECK_RUN_DIR = 'tmp/check-run'
export const ADMISSION_LOG_DIR = 'tmp/admission'

/** 子进程不继承的 git 环境，与 scripts/git-environment.sh 的 `omne_repository_command` 一致。 */
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

/** 轻步骤（单线程检查）同时跑几个：核的三分之一，至少 2。重步骤自己按预算起进程，不受它限制。 */
export function lightConcurrency(cores: number): number {
  return Math.max(2, Math.floor(cores / 3))
}

const seconds = (ms: number) => (ms / 1000).toFixed(1)

/** 逐步耗时表：名字、退出码、秒数、相对开始的起止秒；按开始顺序。 */
export function stepsTable(results: readonly StepResult[], skipped: readonly string[]): string[] {
  const rows = [...results]
    .sort((a, b) => a.startedMs - b.startedMs)
    .map(result =>
      [
        result.name,
        result.cancelled ? 'cancelled' : String(result.exitCode),
        seconds(result.endedMs - result.startedMs),
        seconds(result.startedMs),
        seconds(result.endedMs),
      ].join('\t'),
    )
  return [
    'step\texit\tseconds\tstart\tend',
    ...rows,
    ...skipped.map(name => `${name}\tskipped\t\t\t`),
  ]
}

/**
 * 实际走过的关键路径：从最后结束的步骤出发，每次退到它依赖里最晚结束的那一步。
 * 它解释墙钟花在哪条链上；与它重叠的步骤没有拖长总时间。
 */
export function criticalPath(
  steps: readonly CheckStep[],
  results: readonly StepResult[],
): string[] {
  const byName = new Map(results.map(result => [result.name, result]))
  const dependencies = new Map(steps.map(step => [step.name, step.after]))
  let current = [...results].sort((a, b) => b.endedMs - a.endedMs)[0]
  const path: string[] = []
  while (current !== undefined) {
    path.unshift(current.name)
    const finished = (dependencies.get(current.name) ?? [])
      .map(name => byName.get(name))
      .filter((result): result is StepResult => result !== undefined)
      .sort((a, b) => b.endedMs - a.endedMs)
    current = finished[0]
  }
  return path
}

function tail(path: string, lines: number): string[] {
  try {
    return readFileSync(path, 'utf8').trimEnd().split('\n').slice(-lines)
  } catch {
    return []
  }
}

export interface CheckOptions {
  readonly admission: boolean
  /** 一步失败后继续跑其余步骤，一次看全部失败；退出码仍取第一个失败。 */
  readonly keepGoing: boolean
  /** 只打印步骤表（名字、依赖、重轻、命令），不取基线、不算计划、不跑。 */
  readonly list: boolean
}

const STEP_INPUTS = {
  runnerCli: 'tools/test-runner/src/testing/cli.ts',
  devFlowDeliveryCli: 'tools/dev-flow/src/delivery/change-scope-cli.ts',
  devFlowIntegrationCli: 'tools/dev-flow/src/integration/cli.ts',
} as const

export async function runCheck(root: string, options: CheckOptions): Promise<number> {
  if (options.list) {
    for (const line of describeSteps(checkSteps({ ...STEP_INPUTS, baseline: '<基线>' })))
      console.log(line)
    return 0
  }
  const admission = options.admission || admissionRequested(process.env)
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const name of GIT_ENV) delete env[name]
  if (admission) env['OMNE_ADMISSION'] = '1'

  // 基线按统一规则取：BASELINE，再取任务上下文的基线，再取 origin/main，最后取 main。规则拒绝时抛错，调用方以 2 退出。
  const { targetBase, source } = resolveBaseline(root, env['BASELINE'])
  env['BASELINE'] = targetBase
  const at = coordinates(root, undefined)
  const cores = availableParallelism()

  const runDir = join(root, CHECK_RUN_DIR)
  rmSync(runDir, { recursive: true, force: true })
  mkdirSync(runDir, { recursive: true })
  const admissionLog = admission
    ? join(root, ADMISSION_LOG_DIR, `${timestamp(new Date())}-${at.shortHead}.log`)
    : undefined
  if (admissionLog !== undefined) mkdirSync(join(root, ADMISSION_LOG_DIR), { recursive: true })
  const say = (line: string) => {
    console.log(line)
    if (admissionLog !== undefined) appendFileSync(admissionLog, `${line}\n`)
  }
  say(
    `${admission ? '准入检查' : '检查'}：${process.argv.slice(1).join(' ')}；head ${at.head}${at.dirty ? '（有未提交改动）' : ''}；` +
      `基线 ${targetBase}（${source}）；本机 ${cores} 核；${new Date().toISOString()}`,
  )
  if (admissionLog !== undefined) say(`准入日志：${relative(root, admissionLog)}`)

  // 先算影响面；算不出就在这里失败，不改判全量。
  rmSync(join(root, PLAN_DIR), { recursive: true, force: true })
  const plan = computePlan(root, targetBase, fullRequested(env))
  for (const line of describePlanFile(root, plan)) say(line)
  writePlanFile(join(root, PLAN_FILE), plan)

  const steps = checkSteps({ ...STEP_INPUTS, baseline: targetBase })
  say(
    `${steps.length} 步按依赖并行（重步骤一次一个、轻步骤同时至多 ${lightConcurrency(cores)} 个${options.keepGoing ? '；失败后继续跑其余步骤' : '；一步失败其余终止'}）；日志在 ${CHECK_RUN_DIR}/`,
  )
  const run = await runGraph(steps, {
    root,
    logDir: runDir,
    env,
    lightConcurrency: lightConcurrency(cores),
    keepGoing: options.keepGoing,
    onStart: step => say(`▶ ${step.name}`),
    onFinish: result => {
      const took = `${seconds(result.endedMs - result.startedMs)} 秒`
      if (result.cancelled) say(`⊘ ${result.name} 被终止（${took}）`)
      else if (result.exitCode === 0) say(`✓ ${result.name} ${took}`)
      else
        say(
          `✗ ${result.name} ${took}，退出码 ${result.exitCode}，日志 ${relative(root, result.logPath)}`,
        )
    },
  })

  const table = stepsTable(run.results, run.skipped)
  writeFileSync(join(runDir, 'steps.tsv'), `${table.join('\n')}\n`)
  const failed = run.results.filter(result => result.exitCode !== 0 && !result.cancelled)
  say(
    `总计 ${seconds(run.wallMs)} 秒；关键路径 ${criticalPath(steps, run.results).join(' → ')}；逐步耗时表 ${CHECK_RUN_DIR}/steps.tsv`,
  )
  let exitCode = 0
  if (failed.length > 0) {
    const first = failed.sort((a, b) => a.endedMs - b.endedMs)[0]
    if (first !== undefined) {
      exitCode = first.exitCode > 0 ? first.exitCode : 1
      say(
        `失败：${failed.map(result => result.name).join('、')}；没有开始：${run.skipped.join('、') || '无'}`,
      )
      say(`--- ${first.name} 的日志末尾（${relative(root, first.logPath)}）---`)
      for (const line of tail(first.logPath, 40)) say(line)
    }
  }
  if (admissionLog !== undefined) say(`exit=${exitCode}`)
  return exitCode
}
