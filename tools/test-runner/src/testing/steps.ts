// `pnpm run check` 里按计划执行的几步：pytest、构建、类型检查、成员测试（快慢两层）、可执行验收；
// 以及它们共用的「跑一批成员的脚本并写耗时账本」。计划由 `scope.ts` 算（受影响的成员由 turbo 给出），
// 这里只照着执行、照实说跳了什么。构建、类型检查与成员测试交给 turbo，可执行验收仍由本工具逐成员跑。
import { baselines } from '@omne-harness/repo-toolchain/core/task-context'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { budgetFor, describeBudget, type Budget } from './parallelism.ts'
import { changedFiles, coordinates, type Coordinates } from '@omne-harness/repo-toolchain/core/git'
import { describeCheckPlan, planCheck, type CheckPlan } from './scope.ts'
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
  type LedgerFile,
  type MemberRun,
  type RunMeta,
} from './ledger.ts'
import {
  cacheMeta,
  lookupCache,
  recordCache,
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

/** 环境变量 `FULL`：`1` 要全量，不设或空串不要；别的值报错，不猜。 */
export function fullRequested(env: Readonly<Record<string, string | undefined>>): boolean {
  const value = env['FULL']
  if (value === undefined || value === '') return false
  if (value === '1') return true
  throw new Error(`环境变量 FULL 只能是 1 或不设，现在是 ${value}`)
}

/** 计划文件：计划连同它是对哪个提交、哪个基线算的。 */
export interface PlanFile {
  readonly head: string
  readonly dirty: boolean
  readonly base: { readonly ref: string; readonly mergeBase: string }
  readonly plan: CheckPlan
}

/** 算这个检出相对基线的计划。基线不存在、取不到改动都抛错（引擎出错不改判全量）。 */
export function computePlan(root: string, baseRef: string, full: boolean): PlanFile {
  const config = readTestRunsConfig()
  const at = coordinates(root, baseRef)
  if (at.base === undefined) throw new Error(`算不出基线 ${baseRef} 的合并点`)
  const members = listWorkspaceMembers(fileTree(root), config.affected.excludeRoots)
  const plan = planCheck(
    changedFiles(root, at.base.mergeBase),
    members,
    config.affected,
    affectedMembers(root, members, at.base.mergeBase),
    full,
    paths => dependentMembers(root, members, paths),
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

/** 读计划文件；它算的不是当前提交就报错——计划与执行之间提交变了，计划就不再描述这次改动。 */
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

/** 只核执行要用到的几栏；计划文件由本工具在同一次检查里刚写出。 */
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

/** 计划里的成员目录换成成员；目录已不是成员就报错。 */
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

function spawnInherited(root: string, command: string, args: readonly string[]): number {
  console.log(`$ ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' })
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
  return runner === undefined
    ? spawnInherited(root, pnpmCommand().command, [
        ...pnpmCommand().args,
        '--silent',
        'run',
        'test:python',
      ])
    : spawnInherited(root, 'uv', [
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
        ...[
          'tools/spec-tools/tests',
          '.meta_harness/tooling/tests',
          '.meta_harness/agents/skills/design-subagents/canonical/scripts',
        ].map(path => join(root, path)),
      ])
}

/** 构建：按计划点名，turbo 先构建它们的上游；`OMNE_ADMISSION=1` 时本地缓存只写不读。同时构建的成员数取预算。 */
export function buildStep(root: string, file: PlanFile, budget: Budget): number {
  const paths = file.plan.build.map(entry => entry.path)
  if (paths.length === 0) {
    console.log('构建：跳过——没有被选中的成员')
    return 0
  }
  console.log(
    `构建：${paths.length} 个成员及其上游——${paths.join('、')}（同时 ${budget.workers} 个；${describeBudget(budget)}）`,
  )
  const names = membersAt(root, paths).map(member => member.name)
  return turboBuild(root, names, admissionRequested(process.env), budget.workers)
}

/** 类型检查：按计划点名，由 turbo 运行；不依赖构建。先核对嵌套归档目录已在成员的 tsconfig 里排除。同时检查的成员数取预算。 */
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

/** 一次记账本的运行：跑哪些成员、哪一层，以及账本抬头里写的范围。 */
export interface RecordedRun {
  readonly script: RunScript
  readonly tier: RunTier
  readonly targets: readonly TestMember[]
  /** 运行前构建目标连同依赖：测试由 turbo 按任务依赖在同一次运行里构建，验收在运行前构建。false 时调用方已经构建过。 */
  readonly build: boolean
  readonly out: string | undefined
  readonly at: Coordinates
  /** 账本抬头的 `base`：跑的是全部成员时为 null。 */
  readonly base: RunMeta['base']
  readonly plan: RunMeta['plan']
  readonly scope?: RunMeta['scope']
  /** 这一次运行的工作进程预算：并行度由它推出来（环境变量可盖过），账本记下它的来历。 */
  readonly budget: Budget
  /** 成员测试的结果缓存策略（`test-cache.ts`）；不给就不查也不写（验收不缓存）。 */
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

/** 跑 `targets` 的脚本并写账本；退出码只反映是否全过。 */
export async function recordedRun(root: string, run: RecordedRun): Promise<number> {
  const { script, tier, targets, budget } = run
  const config = readTestRunsConfig()
  const parallel = effectiveParallelism(config, process.env, budget)
  const runDir = runDirOf(run)
  mkdirSync(runDir, { recursive: true })
  // 测试的构建由 turbo 按任务依赖在同一次运行里做；验收不经 turbo，先在这里构建。
  if (script === 'acceptance' && run.build && !buildTargets(root, targets, runDir, budget.workers))
    return 1

  // 成员测试先查缓存：命中的不跑；查不了（快照、依赖图取不到）就全部照跑、不写。
  const lookup =
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
    // 这次覆盖的成员：跑了的与缓存命中的；哪些命中、来源在哪见 `cache`，成员一级的读数只有跑了的。
    members: targets.map(member => member.path),
    // 账本类型来自钉住的 repo-toolchain；预算的来历作为额外一栏记下，供按机器比较账本。
    budget: {
      workers: budget.workers,
      idleFraction: Math.round(budget.machine.idleFraction * 100) / 100,
      freeMemoryMiB: budget.machine.freeMemoryMiB,
    },
  }
  console.log(
    `跑 ${targets.length} 个成员的 \`${script}\`${script === 'test' ? `（${TIER_NAMES[tier]}）` : ''}：` +
      `同时 ${parallel.memberConcurrency} 个成员、每个至多 ${parallel.vitestMaxWorkers} 个工作进程（${describeBudget(budget)}）`,
  )
  const started = Date.now()
  let finishedBefore = 0
  for (const [member, entry] of hits) {
    finishedBefore += 1
    console.log(
      `[${finishedBefore}/${targets.length}] ✓ ${member} 缓存命中，${entry.tests} 条用例，来源 ${entry.ledger}`,
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
      : recordCache(lookup, runs, tier, { ledger: runDir, head: run.at.head, dirty: run.at.dirty })
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
  return runs.every(member => member.exitCode === 0) ? 0 : 1
}

/** 运行前说清缓存怎么用、命中了几个；整个缓存不可用时说原因。 */
function describeLookup(lookup: CacheLookup, total: number): string[] {
  if (lookup.unavailable !== undefined)
    return [`测试缓存：不可用——${lookup.unavailable}；${total} 个成员全部照跑，不写缓存`]
  const skipped =
    lookup.uncacheable.size === 0
      ? ''
      : `；${lookup.uncacheable.size} 个成员算不出键、不缓存：${[...lookup.uncacheable]
          .map(([member, reason]) => `${member}（${reason}）`)
          .join('、')}`
  if (!lookup.policy.read)
    return [`测试缓存：只写不读（${lookup.policy.reason}；${lookup.home}）${skipped}`]
  return [
    `测试缓存：命中 ${lookup.hits.size} 个成员、跑 ${total - lookup.hits.size} 个` +
      `（键与影响面规则同源：成员自己、上游、读者规则点名与全局文件的内容摘要；${lookup.home}）${skipped}`,
  ]
}

/** 摘要里的缓存一行：命中几个、来源哪些账本、这次写了几个、写不进去的。 */
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

/** 合并前的成员测试：计划里的成员的快层，快层全部通过才跑慢层；跑了的层各写一份账本，每层开始时各看一次机器。
 * 计划为空时说「没有要跑的成员」，不算跑过。`build` 为 true 时由 turbo 先构建（单独运行）；准入检查里构建一步已经构建过，不再构建。 */
export async function testStep(
  root: string,
  file: PlanFile,
  build: boolean,
  cache: CachePolicy,
): Promise<number> {
  const config = readTestRunsConfig()
  const selected = new Set(file.plan.test)
  const targets = withScript(
    listWorkspaceMembers(fileTree(root), config.affected.excludeRoots),
    'test',
  ).filter(member => selected.has(member.path))
  if (targets.length !== selected.size)
    throw new Error('计划里的测试成员与现在的成员清单对不上：重新算计划')
  if (targets.length === 0) {
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
  } as const
  console.log(
    `成员测试：${file.plan.mode === 'full' ? '全部' : '按影响面'} ${targets.length} 个成员的快层，快层通过再跑慢层`,
  )
  return fastThenSlow(
    async tier =>
      recordedRun(root, { ...common, tier, cache, budget: await budgetFor(config.parallel) }),
    console.log,
  )
}

/** 快层失败时这一步的结论已定，不再跑慢层，也不写慢层账本；快层通过才跑慢层。 */
export async function fastThenSlow(
  run: (tier: 'fast' | 'slow') => Promise<number>,
  note: (text: string) => void,
): Promise<number> {
  if ((await run('fast')) !== 0) {
    note('快层未通过：慢层没有跑，这一步失败')
    return 1
  }
  return (await run('slow')) === 0 ? 0 : 1
}

/**
 * 计划跳过了全部验收时，为当前提交写一份账本：没跑任何成员、`scope` 里写明跳了谁、为什么。
 * 回路状态的验收耗时传感器认它（读数是「本次影响面不含带验收的成员」），不再因为没有记录而判没数据。
 */
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

/** 可执行验收：只跑计划里有验收的成员（驱动前面构建好的 dist，不再构建）；一个都没有时记一份「跳过」的账本。 */
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
  return recordedRun(root, {
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
}
