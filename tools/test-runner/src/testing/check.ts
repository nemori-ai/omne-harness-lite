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
  worktreeRoot,
  writeAdmissionRun,
  type AdmissionRunInputs,
  type CacheStates,
} from './admission-run.ts'
import { runGraph, type CheckStep, type StepResult } from './check-graph.ts'
import { checkSteps, describeSteps, PLAN_DIR, PLAN_FILE, type StepInputs } from './check-steps.ts'
import {
  describeResume,
  resumeFacts,
  workingTreeDirty,
  resumePlan,
  type PlanRequest,
  type ResumeVerdict,
} from './resume.ts'
import { planCheck, type CheckPlan } from './scope.ts'
import {
  computePlan,
  describePlanFile,
  fullRequested,
  writePlanFile,
  type PlanFile,
} from './steps.ts'
import { describeHealing, healEnvironment, type EnvironmentIo } from './environment.ts'
import { readTestStepReport, TEST_STEP_REPORT_FILE } from './test-retry.ts'
import { timestamp } from './support.ts'
import { cachePolicy, TEST_CACHE_ENV } from './test-cache.ts'
import { admissionRequested, affectedMembers, dependentMembers } from './turbo.ts'
import { effectiveParallelism, readTestRunsConfig } from './config.ts'
import { budgetFor, describeBudget, WORKER_BUDGET_ENV } from './parallelism.ts'

export const KEEP_RUN_DIRS = 5

export const ADMISSION_NEXT_STEP =
  '下一步：先把每处失败归类（本次改动带来的、起点上本来就失败、负载或时序、环境），再按类补证，不重排整跑。' +
  '做法见 docs/engineering/integration.md「准入证据怎样取得」。'
const DEP_GRAPH_CACHE_ENV = 'OMNE_DEP_GRAPH_CACHE'

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

export function lightConcurrency(cores: number): number {
  return Math.max(2, Math.floor(cores / 3))
}

const seconds = (ms: number) => (ms / 1000).toFixed(1)

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

export function criticalPath(results: readonly StepResult[]): string[] {
  const byEnd = [...results].sort((a, b) => b.endedMs - a.endedMs)
  let current = byEnd[0]
  const path: string[] = []
  const visited = new Set<StepResult>()
  while (current !== undefined) {
    visited.add(current)
    path.unshift(current.name)
    const startedAt = current.startedMs
    current = byEnd.find(result => result.endedMs <= startedAt && !visited.has(result))
  }
  return path
}

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
  readonly keepGoing: boolean
  readonly list: boolean
  readonly noCache?: boolean
  readonly resumeFrom?: string
}

export interface CheckDependencies {
  readonly steps?: (inputs: StepInputs) => CheckStep[]
  readonly environment?: EnvironmentIo
}

export const STEP_INPUTS = {
  runnerCli: 'tools/test-runner/src/testing/cli.ts',
  devFlowIntegrationCli: 'tools/dev-flow/src/integration/cli.ts',
} as const

function cacheStates(env: NodeJS.ProcessEnv, full: boolean): CacheStates {
  return {
    test: cachePolicy(env, { noCache: false, full, build: true }).read ? 'on' : 'off',
    depGraph: env[DEP_GRAPH_CACHE_ENV] === '0' ? 'off' : 'on',
  }
}

function judgeResume(
  root: string,
  fromRef: string,
  targetBase: string,
  steps: readonly CheckStep[],
) {
  const records = collectAdmissionRuns(root)
  const worktree = worktreeRoot(root)
  const facts = resumeFacts(root, fromRef, targetBase, { records, worktree })
  const config = readTestRunsConfig()
  const members: WorkspaceMember[] = listWorkspaceMembers(
    fileTree(root),
    config.affected.excludeRoots,
  )
  const plan = (request: PlanRequest): CheckPlan =>
    request.kind === 'whole'
      ? computePlan(root, targetBase, request.mode === 'full').plan
      : planCheck(
          request.paths,
          members,
          config.affected,
          affectedMembers(root, members, facts.from, facts.head),
          false,
          paths => dependentMembers(root, members, paths),
        )
  const verdict = resumePlan({
    ...facts,
    worktree,
    records,
    globalPaths: config.affected.globalPaths,
    steps,
    plan,
  })
  return { facts, verdict }
}

function coordinatesAt(root: string, baseRef: string | undefined) {
  const at = coordinates(root, baseRef)
  return { ...at, dirty: at.dirty || workingTreeDirty(root) }
}

export function changedDuringRun(root: string, startHead: string): boolean {
  const end = coordinatesAt(root, undefined)
  return end.head !== startHead || end.dirty
}

type AcceptedResume = Exclude<ResumeVerdict, { readonly kind: 'rejected' }>

function planFor(
  root: string,
  targetBase: string,
  full: boolean,
  resume: AcceptedResume | undefined,
): PlanFile {
  if (resume === undefined) return computePlan(root, targetBase, full)
  if (resume.kind === 'rerun') return computePlan(root, targetBase, resume.scope.mode === 'full')
  const at = coordinatesAt(root, targetBase)
  if (at.base === undefined) throw new Error(`算不出基线 ${targetBase} 的合并点`)
  return { head: at.head, dirty: at.dirty, base: at.base, plan: resume.plan }
}

export async function runCheck(
  root: string,
  options: CheckOptions,
  dependencies: CheckDependencies = {},
): Promise<number> {
  const stepTable = dependencies.steps ?? checkSteps
  if (options.list && options.resumeFrom !== undefined) {
    console.error('--list 只打印步骤表，不能与 --resume-from 同时给')
    return 2
  }
  if (options.list) {
    for (const line of describeSteps(stepTable(STEP_INPUTS))) console.log(line)
    return 0
  }
  const admission = options.admission || admissionRequested(process.env)
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const name of GIT_ENV) delete env[name]
  if (admission) env['OMNE_ADMISSION'] = '1'
  if (options.noCache === true) env[TEST_CACHE_ENV] = '0'
  const full = fullRequested(env)
  if (options.resumeFrom !== undefined) {
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

  // 准入先自检并自愈环境，再读任何现场：CRLF 工作副本与依赖目录不一致，都会让 dirty 判定、构建与测试失真。
  const healed = admission ? healEnvironment(root, dependencies.environment) : undefined
  if (healed?.dependencies.status === 'install-failed') {
    for (const line of describeHealing(healed)) console.error(line)
    console.error('依赖目录与锁文件不一致且离线安装失败：不跑任何步骤，不写记录')
    return 2
  }

  const { targetBase, source } = resolveBaseline(root, env['BASELINE'])
  env['BASELINE'] = targetBase
  const at = coordinatesAt(root, undefined)
  const cores = availableParallelism()
  const steps = stepTable(STEP_INPUTS)

  let resume: AcceptedResume | undefined
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
  if (healed !== undefined) for (const line of describeHealing(healed)) say(line)
  if (resume !== undefined) for (const line of describeResume(resume, at.head)) say(line)

  rmSync(join(root, PLAN_DIR), { recursive: true, force: true })
  const plan = planFor(root, targetBase, full, resume)
  for (const line of describePlanFile(root, plan)) say(line)
  writePlanFile(join(root, PLAN_FILE), plan)

  // 预算在起任何步骤之前采一次：重步骤开始时在跑的轻步骤是本图自己的，再采样会把它们当成别的负载而缩预算。
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
  const changed = changedDuringRun(root, at.head)
  if (changed)
    say(
      `结束时头已不是 ${at.shortHead}，或工作树有未提交改动：记录记 dirty，不作 ${at.shortHead} 的证据`,
    )

  const testReport = readTestStepReport(join(root, PLAN_DIR, TEST_STEP_REPORT_FILE))
  if (testReport !== undefined && testReport.retried.length > 0)
    say(
      `test 步定向重跑 ${testReport.retried.length} 个文件：${testReport.retried.map(entry => `${entry.file}（${entry.kind}）→ ${entry.retryResult}`).join('、')}`,
    )
  const origin: AdmissionRunInputs['origin'] =
    resume?.kind === 'resume'
      ? { mode: 'resume', from: resume.origin }
      : { mode: plan.plan.mode === 'full' ? 'full' : 'affected' }
  const record = admissionRunFrom({
    steps,
    run,
    head: at.head,
    tree: git(root, ['rev-parse', `${at.head}^{tree}`]),
    dirty: at.dirty || changed,
    worktree: worktreeRoot(root),
    admission,
    caches,
    fullRequested: full || (resume?.kind === 'rerun' && resume.origin.fullRequested),
    base:
      plan.plan.mode === 'full'
        ? null
        : resume?.kind === 'resume'
          ? resume.origin.head
          : plan.base.mergeBase,
    startedAt,
    finishedAt: new Date(),
    ...(healed === undefined ? {} : { environment: healed }),
    ...(testReport === undefined || testReport.head !== at.head
      ? {}
      : { testReport: { retried: testReport.retried, failures: testReport.failures } }),
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
      if (admission) say(ADMISSION_NEXT_STEP)
    }
  }
  if (admissionLog !== undefined) say(`exit=${exitCode}`)
  return exitCode
}
