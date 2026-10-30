// 测试运行入口：
// `plan` 算本次改动的影响面（`pnpm run check` 开头那一步），`step` 按计划执行 pytest、构建、类型检查、成员测试与验收；
// `run` 跑受影响或全部成员的某一层（`--script acceptance` 改跑可执行验收）并写耗时账本；
// `replay` 对主线上最近的提交逐个算计划（只算不跑）；`triage` 对一次运行里的失败做隔离重跑。
// `step`、`run` 的退出码反映那一步是否通过；`plan`、`replay` 只在引擎出错时非零；`triage` 只报告，非零表示工具自己出错。
import { resolveBaseline } from '@omne-harness/repo-toolchain/core/task-context'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { coordinates } from '@omne-harness/repo-toolchain/core/git'
import {
  isRunScript,
  isRunTier,
  readTestRunsConfig,
  RUN_SCRIPTS,
  RUN_TIERS,
  TIER_NAMES,
  type RunScript,
  type RunTier,
} from './config.ts'
import type { Failure } from './ledger.ts'
import { listTestMembers } from '@omne-harness/repo-toolchain/core/workspace'
import { replay, replayTable } from './replay.ts'
import {
  acceptanceStep,
  computePlan,
  describePlanFile,
  fullRequested,
  buildStep,
  typecheckStep,
  pythonStep,
  readPlanFile,
  recordedRun,
  runCachePolicy,
  stepTestCache,
  testStep,
  writePlanFile,
  type PlanFile,
} from './steps.ts'
import { parseFlags as parseSharedFlags, type Flags } from './support.ts'
import { triage, triageSummary } from './triage.ts'
import { budgetFor, describeBudget } from './parallelism.ts'
import { coverageParallelism } from './coverage-parallel.ts'
import { runCheck } from './check.ts'
import { TEST_CACHE_ENV } from './test-cache.ts'

const STEPS = ['python', 'build', 'typecheck', 'test', 'acceptance'] as const
type Step = (typeof STEPS)[number]

const USAGE = [
  '用法：',
  '  baseline [--base <ref>]',
  '      打印统一规则取到的基线：--base，再取环境变量 BASELINE，再取任务上下文的基线，再取 origin/main，最后取 main；',
  '      已绑定任务的树只接受等于 targetBase 的显式基线，否则报错退出',
  '  plan [--base <ref>] [--full] [--json <路径>]',
  '      算基线以来改动的影响面并打印；--json 另写计划文件。基线按 baseline 命令的规则取；',
  '      --full 或环境变量 FULL=1 给全量计划',
  `  step ${STEPS.join('|')} (--plan <计划文件> | [--base <ref>] [--full]) [--no-cache]`,
  '      按计划执行一步；没给计划文件就当场算一份（同 plan）。test 跑计划里成员的快层，快层通过才跑慢层，不构建；',
  '      成员测试读写结果缓存（主检出 tmp/test-cache/），--no-cache、FULL=1、OMNE_TEST_CACHE=0 或准入模式只写不读',
  '  run [--base <ref> | --all] [--tier fast|slow|all] [--script test|acceptance] [--plan-only] [--no-build | --build] [--out <dir>] [--no-cache]',
  '      不给 --all 时按影响面选成员（基线按 baseline 命令的规则取），先构建它们及其依赖（--no-build 跳过），缺省只跑快层',
  '      --all 跑全部成员，缺省两层全跑；测试不构建（调用方先构建），除非给 --build；验收缺省先构建，--no-build 跳过',
  '      --script acceptance 不分层，不接受 --tier',
  '  replay [--ref <ref>] [--count <n>] [--json <路径>]',
  '      对 ref（缺省 main）最近 n 个（缺省 40）first-parent 提交，以父提交为基线逐个算计划，只算不跑',
  '  triage --run <运行目录>',
  '  coverage-parallel',
  '      打印覆盖率跨成员并行的并发度 <同时成员数>x<每成员工作进程数>，两数之积不超过本机的工作进程预算（scripts/metrics.sh 用）',
  '  check [--admission] [--keep-going] [--list] [--no-cache]',
  '      `pnpm run check` 的正文：取基线、算计划，再按步骤图跑全部检查（无依赖的同时跑，一步失败其余终止）；',
  '      --admission 或环境变量 OMNE_ADMISSION=1 为准入模式：构建、类型检查与成员测试都不读缓存，并写准入日志；',
  '      --no-cache 成员测试不读结果缓存（同 OMNE_TEST_CACHE=0）；',
  '      --keep-going 失败后继续跑其余步骤（依赖失败的仍不启动），一次看全部失败；--list 只打印步骤表。调用方先取运行名额',
].join('\n')

const ROOT = resolve(
  process.env['OMNE_SUBJECT_ROOT'] ?? fileURLToPath(new URL('../../../../', import.meta.url)),
)

const parseFlags = (
  argv: readonly string[],
  valued: readonly string[],
  switches: readonly string[],
) => parseSharedFlags(argv, valued, switches, USAGE)

function planFromFlags(flags: Flags): PlanFile {
  const full = flags.switches.has('--full') || fullRequested(process.env)
  return computePlan(ROOT, resolveBaseline(ROOT, flags.values.get('--base')).targetBase, full)
}

/** 打印统一规则取到的基线与来源，供 `pnpm run check` 的开头一步使用。 */
function baseline(argv: readonly string[]): number {
  const flags = parseFlags(argv, ['--base'], [])
  const { state, targetBase, source } = resolveBaseline(ROOT, flags.values.get('--base'))
  console.log(JSON.stringify({ state, targetBase, source }))
  return 0
}

function plan(argv: readonly string[]): number {
  const flags = parseFlags(argv, ['--base', '--json'], ['--full'])
  const file = planFromFlags(flags)
  for (const line of describePlanFile(ROOT, file)) console.log(line)
  const json = flags.values.get('--json')
  if (json !== undefined) writePlanFile(resolve(json), file)
  return 0
}

async function step(argv: readonly string[]): Promise<number> {
  const [name, ...rest] = argv
  if (!(STEPS as readonly unknown[]).includes(name))
    throw new Error(`step 要给 ${STEPS.join('、')} 之一\n${USAGE}`)
  const flags = parseFlags(rest, ['--plan', '--base'], ['--full', '--no-cache'])
  const planPath = flags.values.get('--plan')
  if (planPath !== undefined && (flags.values.has('--base') || flags.switches.has('--full')))
    throw new Error(`--plan 与 --base、--full 不能同时给\n${USAGE}`)
  const file = planPath === undefined ? planFromFlags(flags) : readPlanFile(ROOT, resolve(planPath))
  if (planPath === undefined) for (const line of describePlanFile(ROOT, file)) console.log(line)
  // 预算在用到它的那一步开始时采样一次机器：并行跑着的别的检查会降低空闲率，这一步就少占一些。
  const budget = () => budgetFor(readTestRunsConfig().parallel)
  const steps: Record<Step, () => number | Promise<number>> = {
    python: () => pythonStep(ROOT, file),
    build: async () => buildStep(ROOT, file, await budget(), planPath && resolve(planPath)),
    typecheck: async () => typecheckStep(ROOT, file, await budget()),
    // 带计划文件时在准入检查里，构建一步已经按计划构建；单独运行时由 turbo 先构建。每层开始时自己采样。
    test: () => {
      const { policy, builtFrom } = stepTestCache(process.env, {
        planPath: planPath === undefined ? undefined : resolve(planPath),
        head: file.head,
        noCache: flags.switches.has('--no-cache'),
        full: flags.switches.has('--full') || fullRequested(process.env),
      })
      return testStep(ROOT, file, planPath === undefined, policy, builtFrom)
    },
    acceptance: async () => acceptanceStep(ROOT, file, await budget()),
  }
  return steps[name as Step]()
}

/** 一次运行要做的事；从命令行读出。 */
interface RunRequest {
  readonly base: string | undefined
  readonly script: RunScript
  readonly tier: RunTier
  readonly build: boolean
  readonly planOnly: boolean
  readonly out: string | undefined
  readonly noCache: boolean
}

function scriptOf(flags: Flags): RunScript {
  const script = flags.values.get('--script') ?? 'test'
  if (!isRunScript(script)) throw new Error(`--script 只能是 ${RUN_SCRIPTS.join('、')}\n${USAGE}`)
  return script
}

function tierOf(flags: Flags, script: RunScript, all: boolean): RunTier {
  const tier = flags.values.get('--tier')
  if (tier === undefined) return all || script === 'acceptance' ? 'all' : 'fast'
  if (script === 'acceptance') throw new Error(`可执行验收不分层，不接受 --tier\n${USAGE}`)
  if (!isRunTier(tier)) throw new Error(`--tier 只能是 ${RUN_TIERS.join('、')}\n${USAGE}`)
  return tier
}

function parseRun(argv: readonly string[]): RunRequest {
  const flags = parseFlags(
    argv,
    ['--base', '--out', '--script', '--tier'],
    ['--all', '--plan-only', '--no-build', '--build', '--no-cache'],
  )
  const all = flags.switches.has('--all')
  if (all && flags.values.has('--base')) throw new Error(`--base 与 --all 二选一\n${USAGE}`)
  const base = all ? undefined : resolveBaseline(ROOT, flags.values.get('--base')).targetBase
  if (flags.switches.has('--build') && flags.switches.has('--no-build'))
    throw new Error(`--build 与 --no-build 不能同时给\n${USAGE}`)
  const script = scriptOf(flags)
  // 受影响范围的运行与全量验收自己构建（验收驱动 dist/）；全量测试由调用方先构建，除非要求它构建。
  const buildByDefault = !all || script === 'acceptance'
  return {
    base,
    script,
    tier: tierOf(flags, script, all),
    build: buildByDefault ? !flags.switches.has('--no-build') : flags.switches.has('--build'),
    planOnly: flags.switches.has('--plan-only'),
    out: flags.values.get('--out'),
    noCache: flags.switches.has('--no-cache'),
  }
}

async function run(request: RunRequest): Promise<number> {
  const { base, script, tier } = request
  const config = readTestRunsConfig()
  const members = listTestMembers(ROOT, config.affected.excludeRoots, script)
  let targets = members
  let planned: PlanFile | undefined
  if (base !== undefined) {
    planned = computePlan(ROOT, base, false)
    for (const line of describePlanFile(ROOT, planned)) console.log(line)
    const selected = new Set(script === 'test' ? planned.plan.test : planned.plan.acceptance)
    targets = members.filter(member => selected.has(member.path))
  }
  if (request.planOnly) {
    console.log(`层：${TIER_NAMES[tier]}（${tier}）`)
    console.log(request.build ? '构建：先构建这些成员及其依赖' : '构建：不构建（调用方已构建）')
    return 0
  }
  if (targets.length === 0) {
    console.log(
      base === undefined
        ? `没有成员有 \`${script}\` 脚本，不需要跑。`
        : `没有受影响的成员，不需要跑 \`${script}\` 的${TIER_NAMES[tier]}。`,
    )
    return 0
  }
  return recordedRun(ROOT, {
    script,
    tier,
    targets,
    build: request.build,
    out: request.out,
    at: coordinates(ROOT, undefined),
    base: planned === undefined || planned.plan.mode === 'full' ? null : planned.base,
    plan: planned === undefined ? null : { mode: planned.plan.mode, reason: planned.plan.reason },
    budget: await budgetFor(config.parallel),
    ...(script === 'test'
      ? { cache: runCachePolicy(process.env, { noCache: request.noCache, build: request.build }) }
      : {}),
  })
}

function runReplay(argv: readonly string[]): number {
  const flags = parseFlags(argv, ['--ref', '--count', '--json'], [])
  const count = Number(flags.values.get('--count') ?? '40')
  if (!Number.isInteger(count) || count < 1) throw new Error(`--count 须为正整数\n${USAGE}`)
  const rows = replay(
    ROOT,
    flags.values.get('--ref') ?? 'main',
    count,
    readTestRunsConfig().affected,
  )
  for (const line of replayTable(rows)) console.log(line)
  const json = flags.values.get('--json')
  if (json !== undefined) writeFileSync(resolve(json), `${JSON.stringify(rows, null, 1)}\n`)
  return 0
}

/**
 * 覆盖率跨成员并行的并发度：预算同 `run`（`OMNE_WORKER_BUDGET` 可覆盖），分法见 `coverageParallelism`。
 * 标准输出只有 `<M>x<W>` 一行，说明写到标准错误。
 */
async function coverageParallel(argv: readonly string[]): Promise<number> {
  parseFlags(argv, [], [])
  const policy = readTestRunsConfig().parallel
  const budget = await budgetFor(policy)
  const { members, workers } = coverageParallelism(budget, policy)
  console.error(
    `${describeBudget(budget)}；覆盖率同时 ${members} 个成员，每个至多 ${workers} 个工作进程`,
  )
  console.log(`${members}x${workers}`)
  return 0
}

async function runTriage(argv: readonly string[]): Promise<number> {
  const flags = parseFlags(argv, ['--run'], [])
  const runDir = flags.values.get('--run')
  if (runDir === undefined) throw new Error(`triage 需要 --run <运行目录>\n${USAGE}`)
  const ledgerPath = join(resolve(runDir), 'ledger.json')
  if (!existsSync(ledgerPath))
    throw new Error(`${ledgerPath} 不存在；--run 要给 run 打印出来的那个运行目录`)
  const recorded = JSON.parse(readFileSync(ledgerPath, 'utf8')) as {
    meta: { head: string; dirty: boolean; script?: unknown }
    failures: Failure[]
  }
  // 早于 `--script` 的账本没有这一栏，那时只跑 test。
  const script = recorded.meta.script ?? 'test'
  if (!isRunScript(script))
    throw new Error(`${ledgerPath} 的 meta.script 认不出：${String(script)}`)
  if (recorded.failures.length === 0) {
    console.log('这次运行没有失败，无可归因。')
    return 0
  }
  const at = coordinates(ROOT, undefined)
  if (at.head !== recorded.meta.head || at.dirty || recorded.meta.dirty)
    console.log(
      `注意：那次运行基于提交 ${recorded.meta.head.slice(0, 9)}${recorded.meta.dirty ? '（有未提交改动）' : ''}，` +
        `现在是 ${at.shortHead}${at.dirty ? '（有未提交改动）' : ''}；两边代码不同则重跑结果不可比。`,
    )
  const config = readTestRunsConfig()
  const triageDir = join(resolve(runDir), 'triage')
  console.log(`逐个单独重跑 ${recorded.failures.length} 处失败，每处 ${config.triage.repeats} 次：`)
  const entries = await triage(
    ROOT,
    script,
    recorded.failures,
    config.triage.repeats,
    triageDir,
    (entry, finished) => {
      console.log(
        `[${finished}/${recorded.failures.length}] ${entry.file ?? entry.member}${entry.test === undefined ? '' : ` › ${entry.test}`}`,
      )
    },
  )
  const summary = triageSummary(entries, triageDir)
  writeFileSync(join(triageDir, 'triage.json'), `${JSON.stringify(entries, null, 1)}\n`)
  writeFileSync(join(triageDir, 'summary.md'), `${summary.join('\n')}\n`)
  console.log(summary.join('\n'))
  return 0
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)
  if (command === 'baseline') process.exitCode = baseline(rest)
  else if (command === 'plan') process.exitCode = plan(rest)
  else if (command === 'step') process.exitCode = await step(rest)
  else if (command === 'run') process.exitCode = await run(parseRun(rest))
  else if (command === 'replay') process.exitCode = runReplay(rest)
  else if (command === 'triage') process.exitCode = await runTriage(rest)
  else if (command === 'coverage-parallel') process.exitCode = await coverageParallel(rest)
  else if (command === 'check') {
    const flags = parseFlags(rest, [], ['--admission', '--keep-going', '--list', '--no-cache'])
    if (flags.switches.has('--no-cache')) process.env[TEST_CACHE_ENV] = '0'
    process.exitCode = await runCheck(ROOT, {
      admission: flags.switches.has('--admission'),
      keepGoing: flags.switches.has('--keep-going'),
      list: flags.switches.has('--list'),
    })
  } else throw new Error(`未知命令 ${String(command)}\n${USAGE}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
})
