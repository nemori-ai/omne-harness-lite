// `pnpm run check` 的正文：取基线、算计划、按步骤图跑全部检查，写逐步耗时表与运行记录；准入模式另写准入日志。
// 运行名额由 scripts/check.sh 先取；这里不排队。
// `--resume-from <H1>`：接续 H1 上快速失败的全量准入（resume.ts 判断；这里只按它的结论取计划、跑步骤、写证据）。
import { resolveBaseline } from '@omne-harness/repo-toolchain/core/task-context'
import { coordinates, git } from '@omne-harness/repo-toolchain/core/git'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { availableParallelism } from 'node:os'
import { join, relative } from 'node:path'
import {
  fileTree,
  listWorkspaceMembers,
  type WorkspaceMember,
} from '@omne-harness/repo-toolchain/core/workspace'
import {
  ADMISSION_RECORD_DIR,
  admissionRunFrom,
  CHECK_RUN_RECORD_DIR,
  collectAdmissionRuns,
  recordPathBesideLog,
  RUN_RECORD_FILE,
  writeAdmissionRun,
  type AdmissionRunInputs,
  type CacheStates,
} from './admission-run.ts'
import { runGraph, type CheckStep, type StepResult } from './check-graph.ts'
import { checkSteps, describeSteps, PLAN_DIR, PLAN_FILE, type StepInputs } from './check-steps.ts'
import type { LockfileImpact } from './lockfile-impact.ts'
import {
  describeResume,
  resumeFacts,
  resumePlan,
  type LockfileVerdict,
  type PlanRequest,
  type ResumeVerdict,
} from './resume.ts'
import { LOCKFILE_PATH, planCheck, type CheckPlan } from './scope.ts'
import {
  computePlan,
  describePlanFile,
  fullRequested,
  lockfileImpactBetween,
  writePlanFile,
  type PlanFile,
} from './steps.ts'
import { timestamp } from './support.ts'
import { cachePolicy } from './test-cache.ts'
import { admissionRequested, affectedMembers, dependentMembers } from './turbo.ts'
import { effectiveParallelism, readTestRunsConfig } from './config.ts'
import { budgetFor, describeBudget, WORKER_BUDGET_ENV } from './parallelism.ts'

/** `tmp/check-run/` 下按头分目录，只留最近这么多个头的目录（当前头不计）。 */
export const KEEP_RUN_DIRS = 5
/** repo-toolchain 依赖图缓存的开关（`deps/graph.ts` 的 `WORKING_CACHE_SWITCH`）：`0` 关掉；记录里据它写 depGraph 缓存状态。 */
const DEP_GRAPH_CACHE_ENV = 'OMNE_DEP_GRAPH_CACHE'

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
 * 实际走过的关键路径：从最后结束的步骤出发，每次退到「在它开始之前结束、结束得最晚」的那一步。
 * 一步等的不只是依赖，还有重步骤那条道上的前一个（例如 test 等 typecheck 跑完），所以按时间回溯，不按依赖。
 * 它解释墙钟花在哪条链上；与它重叠的步骤没有拖长总时间。
 */
export function criticalPath(results: readonly StepResult[]): string[] {
  const byEnd = [...results].sort((a, b) => b.endedMs - a.endedMs)
  let current = byEnd[0]
  const path: string[] = []
  while (current !== undefined) {
    path.unshift(current.name)
    const startedAt = current.startedMs
    current = byEnd.find(result => result.endedMs <= startedAt && result !== current)
  }
  return path
}

/** 重步骤日志里写的预算与并行度那几行，供准入日志保留（`tmp/check-run/<短号>/` 只留最近几个头）。 */
export function budgetLines(results: readonly StepResult[]): string[] {
  const lines: string[] = []
  for (const result of results) {
    let text: string
    try {
      text = readFileSync(result.logPath, 'utf8')
    } catch {
      continue
    }
    for (const line of text.split('\n'))
      if (/预算 \d+ 个进程/u.test(line)) lines.push(`${result.name}：${line.trim()}`)
  }
  return lines
}

function tail(path: string, lines: number): string[] {
  try {
    return readFileSync(path, 'utf8').trimEnd().split('\n').slice(-lines)
  } catch {
    return []
  }
}

/**
 * `tmp/check-run/` 下只留最近 `keep` 个别的头的目录（按修改时间），再老的删掉；旧布局直接落在这一层的文件也删掉。
 * 当前头的目录由调用方重建。
 */
export function pruneRunDirs(runRoot: string, current: string, keep: number): void {
  if (!existsSync(runRoot)) return
  const entries = readdirSync(runRoot, { withFileTypes: true })
  for (const entry of entries)
    if (!entry.isDirectory()) rmSync(join(runRoot, entry.name), { force: true })
  const others = entries
    .filter(entry => entry.isDirectory() && entry.name !== current)
    .map(entry => ({
      path: join(runRoot, entry.name),
      mtime: statSync(join(runRoot, entry.name)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime)
  for (const stale of others.slice(keep)) rmSync(stale.path, { recursive: true, force: true })
}

export interface CheckOptions {
  readonly admission: boolean
  /** 一步失败后继续跑其余步骤，一次看全部失败；退出码仍取第一个失败。 */
  readonly keepGoing: boolean
  /** 只打印步骤表（名字、依赖、重轻、命令），不取基线、不算计划、不跑。 */
  readonly list: boolean
  /** `--resume-from <H1>`：接续 H1 上快速失败的全量准入。只在准入模式下接受，与 `FULL=1` 互斥。 */
  readonly resumeFrom?: string
}

/** 可替换的依赖：步骤表。端到端测试在夹具仓库上换成假命令的表，别的照真。 */
export interface CheckDependencies {
  readonly steps?: (inputs: StepInputs) => CheckStep[]
}

const STEP_INPUTS = {
  runnerCli: 'tools/test-runner/src/testing/cli.ts',
  devFlowDeliveryCli: 'tools/dev-flow/src/delivery/change-scope-cli.ts',
  devFlowIntegrationCli: 'tools/dev-flow/src/integration/cli.ts',
} as const

/** 这次运行时各缓存的状态，写进运行记录；`OMNE_TEST_CACHE` 不合法时在这里报错，不等到测试那一步。 */
function cacheStates(env: NodeJS.ProcessEnv, full: boolean): CacheStates {
  return {
    test: cachePolicy(env, { noCache: false, full }).read ? 'on' : 'off',
    depGraph: env[DEP_GRAPH_CACHE_ENV] === '0' ? 'off' : 'on',
    // check 不跑变异，变异增量的状态这里不知道。
    mutation: 'unknown',
  }
}

/** lockfile-impact 的结论换成 resume.ts 要的形状：成员只取路径。 */
function lockfileVerdictOf(impact: LockfileImpact): LockfileVerdict {
  if (impact.kind === 'members')
    return {
      kind: 'members',
      members: new Set(impact.members.map(member => member.path)),
      reason: impact.reason,
    }
  return impact.kind === 'full'
    ? { kind: 'full', reason: impact.reason }
    : { kind: 'none', reason: impact.reason }
}

/**
 * `--resume-from` 的判断：git 事实、本树里的全部记录、全局路径、lockfile 判定、步骤表与影响面函数都交给 resume.ts。
 * 影响面函数：整次的取 `FULL=1` 的计划；按 H1..HEAD 的用 resume.ts 给的路径（它已把锁文件拿出，映射到成员时再放回，
 * 让 planCheck 按同一份判定把它们作为种子带上下游）。
 */
function judgeResume(
  root: string,
  fromRef: string,
  targetBase: string,
  steps: readonly CheckStep[],
) {
  const facts = resumeFacts(root, fromRef)
  const config = readTestRunsConfig()
  const members: WorkspaceMember[] = listWorkspaceMembers(
    fileTree(root),
    config.affected.excludeRoots,
  )
  let impact: LockfileImpact | undefined
  const judgeLockfile = () =>
    (impact ??= lockfileImpactBetween(root, facts.from, facts.head, members))
  const plan = (request: PlanRequest): CheckPlan =>
    request.full
      ? computePlan(root, targetBase, true).plan
      : planCheck(
          [...request.paths, ...(request.lockfileMembers.size > 0 ? [LOCKFILE_PATH] : [])],
          members,
          config.affected,
          affectedMembers(root, members, facts.from, facts.head),
          false,
          paths => dependentMembers(root, members, paths),
          judgeLockfile,
        )
  const verdict = resumePlan({
    ...facts,
    records: collectAdmissionRuns(root),
    globalPaths: config.affected.globalPaths,
    judgeLockfile: () => lockfileVerdictOf(judgeLockfile()),
    steps,
    plan,
  })
  return { facts, verdict }
}

/** 按接续的结论取计划文件：整次全量照常算；接续用 resume.ts 合成的计划，基线仍写统一规则取到的那一个。 */
function planFor(
  root: string,
  targetBase: string,
  full: boolean,
  resume: ResumeVerdict | undefined,
): PlanFile {
  if (resume === undefined) return computePlan(root, targetBase, full)
  if (resume.kind !== 'resume') return computePlan(root, targetBase, true)
  const at = coordinates(root, targetBase)
  if (at.base === undefined) throw new Error(`算不出基线 ${targetBase} 的合并点`)
  return { head: at.head, dirty: at.dirty, base: at.base, plan: resume.plan }
}

export async function runCheck(
  root: string,
  options: CheckOptions,
  dependencies: CheckDependencies = {},
): Promise<number> {
  const stepTable = dependencies.steps ?? checkSteps
  if (options.list) {
    for (const line of describeSteps(stepTable({ ...STEP_INPUTS, baseline: '<基线>' })))
      console.log(line)
    return 0
  }
  const admission = options.admission || admissionRequested(process.env)
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const name of GIT_ENV) delete env[name]
  if (admission) env['OMNE_ADMISSION'] = '1'
  const full = fullRequested(env)
  if (options.resumeFrom !== undefined) {
    // 接续是准入的一种：不带准入模式的运行读缓存，写出的记录也不是任何提交的证据。
    if (!admission) {
      console.error('--resume-from 只用于准入运行：加 --admission 或 OMNE_ADMISSION=1')
      return 2
    }
    if (full) {
      console.error('--resume-from 与 FULL=1 不能同时给：要整次全量就不要接续')
      return 2
    }
  }
  const caches = cacheStates(env, full)

  // 基线按统一规则取：BASELINE，再取任务上下文的基线，再取 origin/main，最后取 main。规则拒绝时抛错，调用方以 2 退出。
  const { targetBase, source } = resolveBaseline(root, env['BASELINE'])
  env['BASELINE'] = targetBase
  const at = coordinates(root, undefined)
  const cores = availableParallelism()
  const steps = stepTable({ ...STEP_INPUTS, baseline: targetBase })

  // 接续的判断在写任何东西之前：拒绝就以 2 退出，不留日志、不写记录。
  let resume: ResumeVerdict | undefined
  if (options.resumeFrom !== undefined) {
    const judged = judgeResume(root, options.resumeFrom, targetBase, steps)
    if (judged.verdict.kind === 'rejected') {
      for (const line of describeResume(judged.verdict, judged.facts.head)) console.log(line)
      return 2
    }
    resume = judged.verdict
  }

  const startedAt = new Date()
  const runRoot = join(root, CHECK_RUN_RECORD_DIR)
  pruneRunDirs(runRoot, at.shortHead, KEEP_RUN_DIRS)
  const runDir = join(runRoot, at.shortHead)
  rmSync(runDir, { recursive: true, force: true })
  mkdirSync(runDir, { recursive: true })
  const runDirName = relative(root, runDir).replaceAll('\\', '/')
  const admissionLog = admission
    ? join(root, ADMISSION_RECORD_DIR, `${timestamp(startedAt)}-${at.shortHead}.log`)
    : undefined
  if (admissionLog !== undefined) mkdirSync(join(root, ADMISSION_RECORD_DIR), { recursive: true })
  const say = (line: string) => {
    console.log(line)
    if (admissionLog !== undefined) appendFileSync(admissionLog, `${line}\n`)
  }
  say(
    `${admission ? '准入检查' : '检查'}：${process.argv.slice(1).join(' ')}；head ${at.head}${at.dirty ? '（有未提交改动）' : ''}；` +
      `基线 ${targetBase}（${source}）；本机 ${cores} 核；${startedAt.toISOString()}`,
  )
  if (admissionLog !== undefined) say(`准入日志：${relative(root, admissionLog)}`)
  if (resume !== undefined) for (const line of describeResume(resume, at.head)) say(line)

  // 先算影响面；算不出就在这里失败，不改判全量。
  rmSync(join(root, PLAN_DIR), { recursive: true, force: true })
  const plan = planFor(root, targetBase, full, resume)
  for (const line of describePlanFile(root, plan)) say(line)
  writePlanFile(join(root, PLAN_FILE), plan)

  // 预算在起任何步骤之前、机器安静时采一次，交给各重步骤：重步骤开始时跑着的轻步骤是本图自己的，
  // 那时再采样只会把它们当成别的负载而缩预算。CI 设了 OMNE_WORKER_BUDGET 时原样交下去。
  const policy = readTestRunsConfig().parallel
  const budget = await budgetFor(policy, env)
  env[WORKER_BUDGET_ENV] = String(budget.workers)
  const parallel = effectiveParallelism(readTestRunsConfig(), env, budget)
  say(
    `${describeBudget(budget)}；成员测试同时 ${parallel.memberConcurrency} 个成员、每个至多 ${parallel.vitestMaxWorkers} 个工作进程（环境变量已设的以环境变量为准）`,
  )
  say(
    `${steps.length} 步按依赖并行（重步骤一次一个、轻步骤同时至多 ${lightConcurrency(cores)} 个${options.keepGoing ? '；失败后继续跑其余步骤' : '；一步失败其余终止'}）；日志在 ${runDirName}/`,
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
      const why = result.reason === undefined ? '' : `，${result.reason}`
      if (result.cancelled) say(`⊘ ${result.name} 被终止（${took}${why}）`)
      else if (result.exitCode === 0) say(`✓ ${result.name} ${took}`)
      else
        say(
          `✗ ${result.name} ${took}，退出码 ${result.exitCode}${why}，日志 ${relative(root, result.logPath)}`,
        )
    },
  })

  const table = stepsTable(run.results, run.skipped)
  writeFileSync(join(runDir, 'steps.tsv'), `${table.join('\n')}\n`)
  const failed = run.results.filter(result => result.exitCode !== 0 && !result.cancelled)
  say(
    `总计 ${seconds(run.wallMs)} 秒；关键路径 ${criticalPath(run.results).join(' → ')}；逐步耗时表 ${runDirName}/steps.tsv`,
  )
  for (const line of budgetLines(run.results)) say(line)

  // 运行记录：准入运行写在准入日志旁边（同名 .json），每次运行都在本头的目录里留一份副本。
  const origin: AdmissionRunInputs['origin'] =
    resume?.kind === 'resume'
      ? { mode: 'resume', from: resume.origin }
      : { mode: plan.plan.mode === 'full' ? 'full' : 'affected' }
  const record = admissionRunFrom({
    steps,
    run,
    head: at.head,
    tree: git(root, ['rev-parse', 'HEAD^{tree}']),
    dirty: at.dirty,
    admission,
    caches,
    base:
      plan.plan.mode === 'full'
        ? null
        : resume?.kind === 'resume'
          ? resume.origin.head
          : targetBase,
    startedAt,
    finishedAt: new Date(),
    origin,
  })
  const copies = [join(runDir, RUN_RECORD_FILE)]
  if (admissionLog !== undefined) copies.unshift(recordPathBesideLog(admissionLog))
  for (const path of copies) writeAdmissionRun(path, record)
  say(`运行记录：${copies.map(path => relative(root, path).replaceAll('\\', '/')).join('、')}`)

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
