import { baselines } from '@omne-harness/repo-toolchain/core/task-context'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { budgetFor, describeBudget, type Budget } from './parallelism.ts'
import {
  changedFiles,
  coordinates,
  fileAt,
  type Coordinates,
} from '@omne-harness/repo-toolchain/core/git'
import { lockfileImpact, workspaceImpact, type LockfileImpact } from './lockfile-impact.ts'
import {
  describeCheckPlan,
  LOCKFILE_PATH,
  planCheck,
  WORKSPACE_PATH,
  type CheckPlan,
} from './scope.ts'
import {
  admissionRequested,
  affectedMembers,
  dependentMembers,
  turboBuild,
  turboTypecheck,
} from './turbo.ts'
import { checkTypecheckScopes } from './typecheck-scope.ts'
import {
  CONFIG_PATH,
  effectiveParallelism,
  ledgerHome,
  readTestRunsConfig,
  TIER_NAMES,
  type RunScript,
  type RunTier,
} from './config.ts'
import {
  buildLedger,
  emptyLedger,
  ledgerSummary,
  testCount,
  type Failure,
  type LedgerFile,
  type MemberRun,
  type RunMeta,
} from './ledger.ts'
import {
  builtFromPath,
  cacheMeta,
  cachePolicy,
  clearBuiltFrom,
  currentDigests,
  outputDigests,
  readBuiltFrom,
  lookupCache,
  recordCache,
  writeBuiltFrom,
  type BuiltMember,
  type BuiltFromRead,
  type CacheLookup,
  type CachePolicy,
} from './test-cache.ts'
import {
  fileTree,
  listWorkspaceMembers,
  listTestMembers,
  withScript,
  type TestMember,
  type WorkspaceMember,
} from '@omne-harness/repo-toolchain/core/workspace'
import { runMembers, runTurboTests, slugOf } from './run.ts'
import { buildTargets, pnpmCommand, timestamp } from './support.ts'
import {
  tierWithRetry,
  writeTestStepReport,
  type FailedFile,
  type RetriedFile,
  type RetryTier,
} from './test-retry.ts'
import { rerunInFile, type RerunOutcome } from './triage.ts'
import { TIER_TASKS } from './turbo.ts'

export function runCachePolicy(
  env: Readonly<Record<string, string | undefined>>,
  options: { readonly noCache: boolean; readonly build: boolean },
): CachePolicy {
  return cachePolicy(env, { ...options, full: fullRequested(env) })
}

export function fullRequested(env: Readonly<Record<string, string | undefined>>): boolean {
  const value = env['FULL']
  if (value === undefined || value === '') return false
  if (value === '1') return true
  throw new Error(`环境变量 FULL 只能是 1 或不设，现在是 ${value}`)
}

export interface PlanFile {
  readonly head: string
  readonly dirty: boolean
  readonly base: { readonly ref: string; readonly mergeBase: string }
  readonly plan: CheckPlan
}

export function lockfileImpactBetween(
  root: string,
  base: string,
  head: string | undefined,
  members: readonly { readonly path: string }[],
): LockfileImpact {
  const sides = (path: string): [string, string] | string => {
    const baseText = fileAt(root, base, path)
    if (baseText === undefined) return `基线 ${base.slice(0, 9)} 上没有 ${path}，判为全量`
    const headText = head === undefined ? worktreeFile(root, path) : fileAt(root, head, path)
    if (headText === undefined)
      return `${head === undefined ? '工作树' : `HEAD ${head.slice(0, 9)}`} 里没有 ${path}，判为全量`
    return [baseText, headText]
  }
  const workspace = sides(WORKSPACE_PATH)
  if (typeof workspace === 'string') return { kind: 'full', reason: workspace }
  const workspaceChange = workspaceImpact(...workspace)
  if (workspaceChange.kind === 'full') return workspaceChange
  const lockfile = sides(LOCKFILE_PATH)
  if (typeof lockfile === 'string') return { kind: 'full', reason: lockfile }
  const impact = lockfileImpact(...lockfile, members)
  return workspaceChange.kind === 'catalog-only' && impact.kind !== 'full'
    ? { ...impact, reason: `${workspaceChange.reason}；${impact.reason}` }
    : impact
}

function worktreeFile(root: string, path: string): string | undefined {
  try {
    return readFileSync(join(root, path), 'utf8')
  } catch {
    return undefined
  }
}

export function computePlan(root: string, baseRef: string, full: boolean): PlanFile {
  const config = readTestRunsConfig()
  const at = coordinates(root, baseRef)
  if (at.base === undefined) throw new Error(`算不出基线 ${baseRef} 的合并点`)
  const mergeBase = at.base.mergeBase
  const members = listWorkspaceMembers(fileTree(root), config.affected.excludeRoots)
  const plan = planCheck(
    changedFiles(root, mergeBase),
    members,
    config.affected,
    affectedMembers(root, members, mergeBase),
    full,
    paths => dependentMembers(root, members, paths),
    () => lockfileImpactBetween(root, mergeBase, undefined, members),
  )
  return { head: at.head, dirty: at.dirty, base: at.base, plan }
}

export function describePlanFile(root: string, file: PlanFile): string[] {
  return [
    `影响面（基线 ${file.base.ref}，合并点 ${file.base.mergeBase.slice(0, 9)}，提交 ${file.head.slice(0, 9)}${file.dirty ? '，含未提交改动' : ''}）`,
    ...describeCheckPlan(file.plan, readTestRunsConfig().affected, relative(root, CONFIG_PATH)),
  ]
}

export function writePlanFile(path: string, file: PlanFile): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(file, null, 1)}\n`)
}

export function readPlanFile(root: string, path: string): PlanFile {
  if (!existsSync(path)) throw new Error(`计划文件 ${path} 不存在：先跑 cli.ts plan --json ${path}`)
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!isPlanFile(parsed)) throw new Error(`计划文件 ${path} 的形状不对：重新算计划`)
  baselines(root, parsed.base.ref)
  const head = coordinates(root, undefined).head
  if (parsed.head !== head)
    throw new Error(
      `计划文件 ${path} 是对提交 ${parsed.head.slice(0, 9)} 算的，现在是 ${head.slice(0, 9)}：重新算计划`,
    )
  return parsed
}

function isPlanFile(value: unknown): value is PlanFile {
  if (typeof value !== 'object' || value === null) return false
  const { head, base, plan } = value as Record<string, unknown>
  if (typeof head !== 'string' || typeof base !== 'object' || base === null) return false
  if (typeof plan !== 'object' || plan === null) return false
  const fields = plan as Record<string, unknown>
  return (
    (fields['mode'] === 'full' || fields['mode'] === 'scoped') &&
    typeof fields['reason'] === 'string' &&
    ['build', 'typecheck', 'test', 'acceptance'].every(key => Array.isArray(fields[key])) &&
    typeof fields['python'] === 'object' &&
    fields['python'] !== null
  )
}

function membersAt(root: string, paths: readonly string[]): WorkspaceMember[] {
  const config = readTestRunsConfig()
  const members = listWorkspaceMembers(fileTree(root), config.affected.excludeRoots)
  const byPath = new Map(members.map(member => [member.path, member]))
  return paths.map(path => {
    const member = byPath.get(path)
    if (member === undefined) throw new Error(`计划里的 ${path} 不是 workspace 成员`)
    return member
  })
}

function spawnInherited(
  root: string,
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): number {
  console.log(`$ ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' })
  if (result.error !== undefined) throw result.error
  return result.status ?? 1
}

export function pythonStep(root: string, file: PlanFile): number {
  if (!file.plan.python.run) {
    console.log(`pytest：跳过——${file.plan.python.reason}`)
    return 0
  }
  console.log(`pytest：跑——${file.plan.python.reason}`)
  const runner = process.env['OMNE_RUNNER_ROOT']
  const env: NodeJS.ProcessEnv = { PYTEST_XDIST_AUTO_NUM_WORKERS: '0', ...process.env }
  return runner === undefined
    ? spawnInherited(
        root,
        pnpmCommand().command,
        [...pnpmCommand().args, '--silent', 'run', 'test:python'],
        env,
      )
    : spawnInherited(
        root,
        'uv',
        [
          'run',
          '--project',
          runner,
          '--locked',
          'pytest',
          '--ignore-glob=*.legacy',
          '-c',
          join(runner, 'pyproject.toml'),
          '--basetemp',
          join(root, 'tmp/test-runs'),
          '-n',
          'auto',
          '--dist',
          'worksteal',
          ...['tools/spec-tools/tests', '.meta_harness/tooling/tests'].map(path =>
            join(root, path),
          ),
        ],
        env,
      )
}

export function buildStep(root: string, file: PlanFile, budget: Budget, planPath?: string): number {
  const paths = file.plan.build.map(entry => entry.path)
  if (paths.length === 0) {
    console.log('构建：跳过——没有被选中的成员')
    return 0
  }
  console.log(
    `构建：${paths.length} 个成员及其上游——${paths.join('、')}（同时 ${budget.workers} 个；${describeBudget(budget)}）`,
  )
  const names = membersAt(root, paths).map(member => member.name)
  const recordPath = planPath === undefined ? undefined : builtFromPath(planPath)
  if (recordPath !== undefined) clearBuiltFrom(recordPath)
  let digests: ReadonlyMap<string, string> | undefined
  if (recordPath !== undefined) {
    try {
      digests = currentDigests({
        root,
        targets: paths,
        config: readTestRunsConfig(),
        env: process.env,
      })
    } catch (error) {
      console.log(
        `构建记录：取不到输入摘要，不留记录，后面的测试不写缓存——${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  const code = turboBuild(root, names, admissionRequested(process.env), budget.workers)
  if (code === 0 && recordPath !== undefined && digests !== undefined)
    try {
      const outputs = outputDigests({ root, targets: paths, config: readTestRunsConfig() })
      const members = new Map<string, Required<BuiltMember>>()
      for (const [member, input] of digests) {
        const output = outputs.get(member)
        if (output !== undefined) members.set(member, { input, output })
      }
      writeBuiltFrom(recordPath, file.head, members)
    } catch (error) {
      console.log(
        `构建记录：取不到产物摘要，不留记录，后面的测试不写缓存——${error instanceof Error ? error.message : String(error)}`,
      )
    }
  return code
}

function unbuiltReason(read: Exclude<BuiltFromRead, { status: 'ok' }>, head: string): string {
  switch (read.status) {
    case 'missing':
      return '计划旁边没有构建记录，测试可能跑的是旧 dist'
    case 'other-head':
      return `构建记录是另一个提交的（记录 ${read.recorded.slice(0, 9)}，现在 ${head.slice(0, 9)}），测试可能跑的是旧 dist`
    case 'legacy':
      return '构建记录是旧格式，测试可能跑的是旧 dist'
  }
}

export function stepTestCache(
  env: Readonly<Record<string, string | undefined>>,
  options: {
    readonly planPath: string | undefined
    readonly head: string
    readonly noCache: boolean
    readonly full: boolean
  },
): {
  readonly policy: CachePolicy
  readonly builtFrom: ReadonlyMap<string, BuiltMember> | undefined
} {
  const read =
    options.planPath === undefined
      ? undefined
      : readBuiltFrom(builtFromPath(options.planPath), options.head)
  const builtFrom = read?.status === 'ok' ? read.members : undefined
  return {
    policy: cachePolicy(env, {
      noCache: options.noCache,
      full: options.full,
      build: options.planPath === undefined || builtFrom !== undefined,
      ...(read === undefined || read.status === 'ok'
        ? {}
        : { unbuiltReason: unbuiltReason(read, options.head) }),
    }),
    builtFrom,
  }
}

export function typecheckStep(root: string, file: PlanFile, budget: Budget): number {
  const paths = file.plan.typecheck
  if (paths.length === 0) {
    console.log('类型检查：跳过——没有被选中的成员')
    return 0
  }
  const members = membersAt(root, paths)
  console.log(
    `类型检查：${paths.length} 个成员——${paths.join('、')}（同时 ${budget.workers} 个；${describeBudget(budget)}）`,
  )
  checkTypecheckScopes(root, members)
  return turboTypecheck(
    root,
    members.map(member => member.name),
    admissionRequested(process.env),
    budget.workers,
  )
}

export interface RecordedRun {
  readonly script: RunScript
  readonly tier: RunTier
  readonly targets: readonly TestMember[]
  readonly build: boolean
  readonly out: string | undefined
  readonly at: Coordinates
  readonly base: RunMeta['base']
  readonly plan: RunMeta['plan']
  readonly scope?: RunMeta['scope']
  readonly budget: Budget
  readonly builtFrom?: ReadonlyMap<string, BuiltMember>
  readonly cache?: CachePolicy
}

function runDirOf(run: RecordedRun): string {
  return resolve(
    run.out ??
      join(
        ledgerHome(run.script, run.at.mainRoot, process.env),
        `${run.at.shortHead}${run.at.dirty ? '-dirty' : ''}`,
        `${timestamp(new Date())}${run.tier === 'all' ? '' : `-${run.tier}`}`,
      ),
  )
}

export interface RecordedOutcome {
  readonly exitCode: number
  readonly failures: readonly Failure[]
  readonly runDir: string
}

export async function recordedRun(root: string, run: RecordedRun): Promise<RecordedOutcome> {
  const { script, tier, targets, budget } = run
  const config = readTestRunsConfig()
  const parallel = effectiveParallelism(config, process.env, budget)
  const runDir = runDirOf(run)
  mkdirSync(runDir, { recursive: true })
  if (script === 'acceptance' && run.build && !buildTargets(root, targets, runDir, budget.workers))
    return { exitCode: 1, failures: [], runDir }

  const found =
    script === 'test' && run.cache !== undefined
      ? lookupCache({
          root,
          mainRoot: run.at.mainRoot,
          targets: targets.map(member => member.path),
          tier,
          policy: run.cache,
          config,
          env: process.env,
        })
      : undefined
  const builtFrom =
    found === undefined
      ? undefined
      : (run.builtFrom ??
        (run.build
          ? new Map([...found.keys].map(([member, { digest }]) => [member, { input: digest }]))
          : undefined))
  const lookup =
    found === undefined || builtFrom === undefined ? found : { ...found, built: builtFrom }
  const hits = lookup?.hits ?? new Map<string, never>()
  const toRun = targets.filter(member => !hits.has(member.path))
  if (lookup !== undefined)
    for (const line of describeLookup(lookup, targets.length)) console.log(line)

  const meta = {
    script,
    tier,
    head: run.at.head,
    branch: run.at.branch,
    dirty: run.at.dirty,
    base: run.base,
    startedAt: new Date().toISOString(),
    parallel,
    cores: budget.machine.cores,
    plan: run.plan,
    ...(run.scope === undefined ? {} : { scope: run.scope }),
    members: targets.map(member => member.path),
    budget: {
      workers: budget.workers,
      idleFraction: Math.round(budget.machine.idleFraction * 100) / 100,
      freeMemoryMiB: budget.machine.freeMemoryMiB,
    },
  }
  if (script === 'test' && toRun.length === 0)
    console.log(`${targets.length} 个成员全部命中缓存，没有执行（${TIER_NAMES[tier]}）`)
  else
    console.log(
      `跑 ${toRun.length} 个成员的 \`${script}\`${script === 'test' ? `（${TIER_NAMES[tier]}）` : ''}：` +
        `同时 ${parallel.memberConcurrency} 个成员、每个至多 ${parallel.vitestMaxWorkers} 个工作进程（${describeBudget(budget)}）`,
    )
  const started = Date.now()
  let finishedBefore = 0
  for (const [member, entry] of hits) {
    finishedBefore += 1
    console.log(
      `[${finishedBefore}/${targets.length}] ✓ ${member} 缓存命中，${entry.tests} 条用例，取自 ${entry.head.slice(0, 9)} 在 ${entry.recordedAt} 的运行，来源 ${entry.ledger}`,
    )
  }
  const report = (done: MemberRun, finished: number) => {
    const tests = done.report === undefined ? undefined : testCount(done.report)
    console.log(
      `[${finishedBefore + finished}/${targets.length}] ${done.exitCode === 0 ? '✓' : '✗'} ${done.member} ${Math.round(done.wallSeconds)} 秒` +
        (tests === undefined ? '' : `，${tests} 条用例`) +
        (done.exitCode === 0
          ? ''
          : `，退出码 ${done.exitCode}，日志 ${join(runDir, `${slugOf(done.member)}.log`)}`),
    )
  }
  const runs =
    script !== 'test'
      ? await runMembers(root, targets, runDir, parallel, script, report)
      : toRun.length === 0
        ? []
        : await runTurboTests(
            root,
            toRun,
            runDir,
            parallel,
            tier,
            { build: run.build, admission: admissionRequested(process.env) },
            report,
          )
  const wallSeconds = (Date.now() - started) / 1000
  const recorded =
    lookup === undefined
      ? undefined
      : recordCache(lookup, runs, tier, {
          ledger: runDir,
          head: run.at.head,
          dirty: run.at.dirty,
          admission: admissionRequested(process.env),
        })
  for (const line of recorded?.skipped ?? []) console.log(`测试缓存：${line}`)
  const cache =
    lookup === undefined || recorded === undefined ? {} : { cache: cacheMeta(lookup, recorded) }

  const ledger = buildLedger(runs, root, config.ledger.nearTimeoutRatio)
  const summary = ledgerSummary(ledger, {
    wallSeconds,
    slowFileSeconds: config.ledger.slowFileSeconds,
    nearTimeoutRatio: config.ledger.nearTimeoutRatio,
    top: config.ledger.top,
    runDir,
    ...(hits.size === 0 ? {} : { cachedMembers: hits.size }),
  })
  if (ledger.failures.length > 0)
    summary.push(`对这些失败做隔离重跑：pnpm run test:triage --run ${runDir}`)
  if (lookup !== undefined && recorded !== undefined)
    summary.push(...describeCacheResult(lookup, recorded))
  writeFileSync(
    join(runDir, 'ledger.json'),
    `${JSON.stringify({ meta: { ...meta, wallSeconds: Math.round(wallSeconds), ...cache }, ...ledger } satisfies LedgerFile & { meta: { budget: unknown; cache?: unknown } }, null, 1)}\n`,
  )
  writeFileSync(join(runDir, 'summary.md'), `${summary.join('\n')}\n`)
  console.log(summary.join('\n'))
  return {
    exitCode: runs.every(member => member.exitCode === 0) ? 0 : 1,
    failures: ledger.failures,
    runDir,
  }
}

function describeLookup(lookup: CacheLookup, total: number): string[] {
  if (lookup.unavailable !== undefined)
    return [`测试缓存：不可用——${lookup.unavailable}；${total} 个成员全部照跑，不写缓存`]
  const noWrite = lookup.policy.write ? '' : `；不写缓存（${lookup.policy.writeReason}）`
  const skipped =
    lookup.uncacheable.size === 0
      ? ''
      : `；${lookup.uncacheable.size} 个成员算不出键、不缓存：${[...lookup.uncacheable]
          .map(([member, reason]) => `${member}（${reason}）`)
          .join('、')}`
  if (!lookup.policy.read)
    return [
      `测试缓存：${lookup.policy.write ? '只写不读' : '不读'}（${lookup.policy.reason}；${lookup.home}）${skipped}${noWrite}`,
    ]
  return [
    `测试缓存：命中 ${lookup.hits.size} 个成员、跑 ${total - lookup.hits.size} 个` +
      (lookup.policy.trustedOnly ? '（准入模式：只认准入模式下真跑出来的记录）' : '') +
      `（键与影响面规则同源：成员自己、上游、读者规则点名与全局文件的内容摘要；${lookup.home}）${skipped}${noWrite}`,
  ]
}

function describeCacheResult(
  lookup: CacheLookup,
  recorded: { readonly written: readonly string[]; readonly problems: readonly string[] },
): string[] {
  if (lookup.unavailable !== undefined) return [`缓存不可用：${lookup.unavailable}`]
  const sources = [...new Set([...lookup.hits.values()].map(entry => entry.ledger))]
  const lines = [
    `缓存命中 ${lookup.hits.size} 个成员` +
      (sources.length === 0 ? '' : `，来源 ${sources.join('、')}`) +
      `；本次写入 ${recorded.written.length} 个成员的完整通过` +
      (lookup.policy.read ? '' : `（只写不读：${lookup.policy.reason}）`),
  ]
  if (recorded.problems.length > 0)
    lines.push(`  缓存写不进去（按未命中处理）：${recorded.problems.join('；')}`)
  return lines
}

const planSummary = (plan: CheckPlan) => ({ mode: plan.mode, reason: plan.reason })

export async function testStep(
  root: string,
  file: PlanFile,
  build: boolean,
  cache: CachePolicy,
  builtFrom?: ReadonlyMap<string, BuiltMember>,
  reportPath?: string,
): Promise<number> {
  const config = readTestRunsConfig()
  const selected = new Set(file.plan.test)
  const targets = withScript(
    listWorkspaceMembers(fileTree(root), config.affected.excludeRoots),
    'test',
  ).filter(member => selected.has(member.path))
  if (targets.length !== selected.size)
    throw new Error('计划里的测试成员与现在的成员清单对不上：重新算计划')
  const resumed = file.plan.testResume
  if (targets.length === 0 && resumed === undefined) {
    console.log(
      `成员测试：没有要跑的成员（${file.plan.reason}）——这一步什么都没跑，不是「跑过了、全绿」`,
    )
    return 0
  }
  const at = coordinates(root, undefined)
  const common = {
    script: 'test',
    targets,
    build,
    out: undefined,
    at,
    base: file.plan.mode === 'full' ? null : file.base,
    plan: planSummary(file.plan),
    ...(builtFrom === undefined ? {} : { builtFrom }),
  } as const
  const report = { failures: [] as FailedFile[], retried: [] as RetriedFile[] }
  let code = 0
  if (targets.length > 0) {
    console.log(
      `成员测试：${file.plan.mode === 'full' ? '全部' : resumed === undefined ? '按影响面' : '按 H1..HEAD 影响面'} ${targets.length} 个成员的快层，快层通过再跑慢层`,
    )
    code = await fastThenSlow(async tier => {
      const outcome = await tierWithRetry(
        tier,
        async () =>
          recordedRun(root, { ...common, tier, cache, budget: await budgetFor(config.parallel) }),
        failed => rerunFailedFile(root, failed),
        console.log,
      )
      report.failures = [...outcome.failures]
      report.retried = [...report.retried, ...outcome.retried]
      return outcome.exitCode
    }, console.log)
  }
  if (code === 0 && resumed !== undefined) {
    const covered = new Set(targets.map(member => member.path))
    const alone = resumeFilesToRun(resumed.files, covered)
    console.log(
      `成员测试（接续）：H1 上失败的 ${resumed.files.length} 个文件里 ${alone.length} 个单独各跑一次（其余所在成员已整个跑过），成员串行、每成员 1 个工作进程`,
    )
    for (const failed of alone) {
      const outcome = await rerunFailedFile(root, failed)
      console.log(`  ${failed.file}（${failed.tier}）→ ${outcome}`)
      if (outcome !== 'passed') {
        code = 1
        report.failures.push(failed)
      }
    }
    if (alone.length > 0)
      console.log(code === 0 ? '接续的失败文件全部通过' : '接续的失败文件仍有没过的：这一步失败')
  }
  if (reportPath !== undefined) writeTestStepReport(reportPath, { head: file.head, ...report })
  return code
}

export function resumeFilesToRun(
  files: readonly FailedFile[],
  coveredMembers: ReadonlySet<string>,
): FailedFile[] {
  return files.filter(file => !coveredMembers.has(file.member))
}

async function rerunFailedFile(root: string, failed: FailedFile): Promise<RerunOutcome> {
  const base = join(
    ledgerHome('test', coordinates(root, undefined).mainRoot, process.env),
    'retry',
    `${timestamp(new Date())}-${slugOf(failed.member)}-${failed.file.split('/').at(-1) ?? 'file'}`,
  )
  mkdirSync(dirname(base), { recursive: true })
  return rerunInFile(root, TIER_TASKS[failed.tier], failed.member, failed.file, undefined, base)
}

export async function fastThenSlow(
  run: (tier: RetryTier) => Promise<number>,
  note: (text: string) => void,
): Promise<number> {
  if ((await run('fast')) !== 0) {
    note('快层未通过：慢层没有跑，这一步失败')
    return 1
  }
  return (await run('slow')) === 0 ? 0 : 1
}

export function recordSkippedAcceptance(
  at: Coordinates,
  env: Readonly<Record<string, string | undefined>>,
  plan: CheckPlan,
  base: PlanFile['base'],
  skipped: readonly string[],
): string {
  const runDir = join(
    ledgerHome('acceptance', at.mainRoot, env),
    `${at.shortHead}${at.dirty ? '-dirty' : ''}`,
    `${timestamp(new Date())}-skipped`,
  )
  mkdirSync(runDir, { recursive: true })
  const meta: RunMeta = {
    script: 'acceptance',
    tier: 'all',
    head: at.head,
    branch: at.branch,
    dirty: at.dirty,
    base,
    startedAt: new Date().toISOString(),
    parallel: { memberConcurrency: 1, vitestMaxWorkers: 1 },
    cores: availableParallelism(),
    plan: planSummary(plan),
    scope: { reason: '本次影响面不含带验收的成员', skipped },
    members: [],
    wallSeconds: 0,
  }
  const path = join(runDir, 'ledger.json')
  writeFileSync(
    path,
    `${JSON.stringify({ meta, ...emptyLedger() } satisfies LedgerFile, null, 1)}\n`,
  )
  return path
}

export async function acceptanceStep(
  root: string,
  file: PlanFile,
  budget: Budget,
): Promise<number> {
  const config = readTestRunsConfig()
  const accepting = listTestMembers(root, config.affected.excludeRoots, 'acceptance')
  const selected = new Set(file.plan.acceptance)
  const targets = accepting.filter(member => selected.has(member.path))
  const skipped = accepting.filter(member => !selected.has(member.path)).map(member => member.path)
  const at = coordinates(root, undefined)
  if (targets.length === 0) {
    const path = recordSkippedAcceptance(at, process.env, file.plan, file.base, skipped)
    console.log(
      `验收：跳过——本次影响面不含带验收的成员（${skipped.join('、') || '没有成员有验收'}）；记录：${path}`,
    )
    return 0
  }
  console.log(
    `验收：${targets.map(member => member.path).join('、')}` +
      (skipped.length > 0 ? `；跳过 ${skipped.join('、')}（不在本次影响面）` : ''),
  )
  const outcome = await recordedRun(root, {
    script: 'acceptance',
    tier: 'all',
    targets,
    build: false,
    out: undefined,
    at,
    base: file.plan.mode === 'full' ? null : file.base,
    plan: planSummary(file.plan),
    scope: { reason: file.plan.reason, skipped },
    budget,
  })
  return outcome.exitCode
}
