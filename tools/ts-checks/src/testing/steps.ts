// `make check` 里按计划执行的几步：pytest、构建、类型检查、成员测试（快慢两层）、可执行验收；
// 以及它们共用的「跑一批成员的脚本并写耗时账本」。计划由 `scope.ts` 算（受影响的成员由 turbo 给出），
// 这里只照着执行、照实说跳了什么。构建交给 turbo，类型检查与测试仍由本工具逐成员跑。
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { baselines } from '../integration/context.ts'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { changedFiles, coordinates, type Coordinates } from '../metrics/git.ts'
import { describeCheckPlan, planCheck, type CheckPlan } from './scope.ts'
import { admissionRequested, affectedMembers, turboBuild } from './turbo.ts'
import {
  CONFIG_PATH,
  effectiveParallelism,
  ledgerHome,
  readTestRunsConfig,
  TIER_NAMES,
  type RunScript,
  type RunTier,
} from './config.ts'
import { buildLedger, emptyLedger, ledgerSummary, type LedgerFile, type RunMeta } from './ledger.ts'
import {
  fileTree,
  listWorkspaceMembers,
  listTestMembers,
  withScript,
  type TestMember,
  type WorkspaceMember,
} from './members.ts'
import { runMembers, slugOf } from './run.ts'
import { buildTargets, timestamp } from './support.ts'

/** 环境变量 `FULL`：`1` 要全量，不设或空串不要；别的值报错，不猜。 */
export function fullRequested(env: Readonly<Record<string, string | undefined>>): boolean {
  const value = env['FULL']
  if (value === undefined || value === '') return false
  if (value === '1') return true
  throw new Error(`环境变量 FULL 只能是 1 或不设，现在是 ${value}`)
}

/** 基线：给了用它，否则环境变量 BASELINE，再否则 main。 */
export function baselineOf(
  given: string | undefined,
  env: Readonly<Record<string, string | undefined>>,
): string {
  const fromEnv = env['BASELINE']
  return given ?? (fromEnv === undefined || fromEnv === '' ? 'main' : fromEnv)
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
  const affected = affectedMembers(root, members, at.base.mergeBase)
  const plan = planCheck(
    changedFiles(root, at.base.mergeBase),
    members,
    config.affected,
    affected,
    full,
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
    ? spawnInherited(root, 'make', ['--no-print-directory', 'test'])
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

/** 构建：按计划点名，turbo 先构建它们的上游；`OMNE_ADMISSION=1` 时本地缓存只写不读。 */
export function buildStep(root: string, file: PlanFile): number {
  const paths = file.plan.build.map(entry => entry.path)
  if (paths.length === 0) {
    console.log('构建：跳过——没有被选中的成员')
    return 0
  }
  console.log(`构建：${paths.length} 个成员及其上游——${paths.join('、')}`)
  const names = membersAt(root, paths).map(member => member.name)
  return turboBuild(root, names, admissionRequested(process.env))
}

/** 类型检查：按计划逐个点名；不依赖构建，嵌套的归档目录由 typecheck-member.ts 排除。 */
export function typecheckStep(root: string, file: PlanFile): number {
  const paths = file.plan.typecheck
  if (paths.length === 0) {
    console.log('类型检查：跳过——没有被选中的成员')
    return 0
  }
  const members = membersAt(root, paths)
  console.log(`类型检查：${paths.length} 个成员——${paths.join('、')}`)
  return spawnInherited(root, 'pnpm', [
    '-r',
    ...members.flatMap(member => ['--filter', member.name]),
    'exec',
    process.execPath,
    '--experimental-strip-types',
    fileURLToPath(new URL('./typecheck-member.ts', import.meta.url)),
  ])
}

/** 一次记账本的运行：跑哪些成员、哪一层，以及账本抬头里写的范围。 */
export interface RecordedRun {
  readonly script: RunScript
  readonly tier: RunTier
  readonly targets: readonly TestMember[]
  /** 先把目标连同依赖构建一遍。 */
  readonly build: boolean
  readonly out: string | undefined
  readonly at: Coordinates
  /** 账本抬头的 `base`：跑的是全部成员时为 null。 */
  readonly base: RunMeta['base']
  readonly plan: RunMeta['plan']
  readonly scope?: RunMeta['scope']
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
  const { script, tier, targets } = run
  const config = readTestRunsConfig()
  const parallel = effectiveParallelism(config, process.env)
  const runDir = runDirOf(run)
  mkdirSync(runDir, { recursive: true })
  if (run.build && !buildTargets(root, targets, runDir)) return 1

  const meta = {
    script,
    tier,
    head: run.at.head,
    branch: run.at.branch,
    dirty: run.at.dirty,
    base: run.base,
    startedAt: new Date().toISOString(),
    parallel,
    cores: availableParallelism(),
    plan: run.plan,
    ...(run.scope === undefined ? {} : { scope: run.scope }),
    members: targets.map(member => member.path),
  }
  console.log(
    `跑 ${targets.length} 个成员的 \`${script}\`${script === 'test' ? `（${TIER_NAMES[tier]}）` : ''}：` +
      `同时 ${parallel.memberConcurrency} 个成员、每个至多 ${parallel.vitestMaxWorkers} 个工作进程（本机 ${meta.cores} 核）`,
  )
  const started = Date.now()
  const runs = await runMembers(root, targets, runDir, parallel, script, tier, (done, finished) => {
    const tests = done.report?.testResults.reduce(
      (sum, file) =>
        sum +
        file.assertionResults.filter(
          assertion => assertion.status === 'passed' || assertion.status === 'failed',
        ).length,
      0,
    )
    console.log(
      `[${finished}/${targets.length}] ${done.exitCode === 0 ? '✓' : '✗'} ${done.member} ${Math.round(done.wallSeconds)} 秒` +
        (tests === undefined ? '' : `，${tests} 条用例`) +
        (done.exitCode === 0
          ? ''
          : `，退出码 ${done.exitCode}，日志 ${join(runDir, `${slugOf(done.member)}.log`)}`),
    )
  })
  const wallSeconds = (Date.now() - started) / 1000

  const ledger = buildLedger(runs, root, config.ledger.nearTimeoutRatio)
  const summary = ledgerSummary(ledger, {
    wallSeconds,
    slowFileSeconds: config.ledger.slowFileSeconds,
    nearTimeoutRatio: config.ledger.nearTimeoutRatio,
    top: config.ledger.top,
    runDir,
  })
  if (ledger.failures.length > 0)
    summary.push(`对这些失败做隔离重跑：make test-triage RUN=${runDir}`)
  writeFileSync(
    join(runDir, 'ledger.json'),
    `${JSON.stringify({ meta: { ...meta, wallSeconds: Math.round(wallSeconds) }, ...ledger } satisfies LedgerFile, null, 1)}\n`,
  )
  writeFileSync(join(runDir, 'summary.md'), `${summary.join('\n')}\n`)
  console.log(summary.join('\n'))
  return runs.every(member => member.exitCode === 0) ? 0 : 1
}

const planSummary = (plan: CheckPlan) => ({ mode: plan.mode, reason: plan.reason })

/** 合并前的成员测试：计划里的成员的快层，再慢层；各写一份账本。计划为空时说「没有要跑的成员」，不算跑过。 */
export async function testStep(root: string, file: PlanFile): Promise<number> {
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
    build: false,
    out: undefined,
    at,
    base: file.plan.mode === 'full' ? null : file.base,
    plan: planSummary(file.plan),
  } as const
  console.log(
    `成员测试：${file.plan.mode === 'full' ? '全部' : '按影响面'} ${targets.length} 个成员的快层，再慢层`,
  )
  const fast = await recordedRun(root, { ...common, tier: 'fast' })
  const slow = await recordedRun(root, { ...common, tier: 'slow' })
  return fast === 0 && slow === 0 ? 0 : 1
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
export async function acceptanceStep(root: string, file: PlanFile): Promise<number> {
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
  })
}
