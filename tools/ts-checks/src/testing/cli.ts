// 测试运行入口：`run` 算受影响范围并跑测试（`--tier` 选层，`--script acceptance` 改跑可执行验收）、写耗时账本；
// `gate` 是合并前那一步：全部成员的快层，再加受影响成员的慢层；`triage` 对一次运行里的失败做隔离重跑。
// `run`、`gate` 的退出码只反映测试是否全过；`triage` 只报告，退出码非零表示工具自己出错。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { changedFiles, coordinates } from '../metrics/git.ts'
import {
  describePlan,
  listTestMembers,
  planAffected,
  type AffectedPlan,
  type TestMember,
} from './affected.ts'
import {
  effectiveParallelism,
  isRunScript,
  isRunTier,
  ledgerHome,
  readTestRunsConfig,
  RUN_SCRIPTS,
  RUN_TIERS,
  TIER_NAMES,
  type RunScript,
  type RunTier,
} from './config.ts'
import { buildLedger, ledgerSummary, type Failure, type LedgerFile } from './ledger.ts'
import { runMembers, slugOf } from './run.ts'
import { buildTargets, parseFlags as parseSharedFlags, timestamp, type Flags } from './support.ts'
import { triage, triageSummary } from './triage.ts'

const USAGE = [
  '用法：',
  '  run (--base <ref> | --all) [--tier fast|slow|all] [--script test|acceptance] [--plan-only] [--no-build | --build] [--out <dir>]',
  '      --base 先构建受影响的成员及其依赖（--no-build 跳过），缺省只跑快层；--all 不构建（调用方先构建），除非给 --build，缺省两层全跑',
  '      --script acceptance 不分层，不接受 --tier',
  '  gate [--base <ref>]',
  '      合并前：全部成员的快层，再加受影响成员的慢层；不构建（调用方先构建）。基线缺省取环境变量 BASELINE，再缺省 main',
  '  triage --run <运行目录>',
].join('\n')

/** 一次运行要做的事；`run` 从命令行读出它，`gate` 拼两次。 */
interface RunRequest {
  readonly base: string | undefined
  readonly script: RunScript
  readonly tier: RunTier
  readonly build: boolean
  readonly planOnly: boolean
  readonly out: string | undefined
}

const ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))

const parseFlags = (
  argv: readonly string[],
  valued: readonly string[],
  switches: readonly string[],
) => parseSharedFlags(argv, valued, switches, USAGE)

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
    ['--all', '--plan-only', '--no-build', '--build'],
  )
  const base = flags.values.get('--base')
  const all = flags.switches.has('--all')
  if ((base === undefined) === !all) throw new Error(`--base 与 --all 二选一\n${USAGE}`)
  if (flags.switches.has('--build') && flags.switches.has('--no-build'))
    throw new Error(`--build 与 --no-build 不能同时给\n${USAGE}`)
  const script = scriptOf(flags)
  return {
    base,
    script,
    tier: tierOf(flags, script, all),
    // 受影响范围的运行自己构建；全量运行由调用方先构建，除非要求它构建。
    build: all ? flags.switches.has('--build') : !flags.switches.has('--no-build'),
    planOnly: flags.switches.has('--plan-only'),
    out: flags.values.get('--out'),
  }
}

async function run(request: RunRequest): Promise<number> {
  const { base, script, tier } = request
  const all = base === undefined
  const config = readTestRunsConfig()
  const parallel = effectiveParallelism(config, process.env)
  const at = coordinates(ROOT, base)
  const members = listTestMembers(ROOT, config.affected.excludeRoots, script)

  let plan: AffectedPlan | undefined
  let targets = members
  if (at.base !== undefined) {
    plan = planAffected(changedFiles(ROOT, at.base.mergeBase), members, config.affected.globalPaths)
    const selected = new Set([...plan.changed, ...plan.dependents])
    targets = members.filter(member => selected.has(member.path))
    console.log(`受影响范围（基线 ${at.base.ref}，合并点 ${at.base.mergeBase.slice(0, 9)}）：`)
    for (const line of describePlan(plan, members.length)) console.log(`  ${line}`)
  }
  if (request.planOnly) {
    console.log(`层：${TIER_NAMES[tier]}（${tier}）`)
    return 0
  }
  if (targets.length === 0) {
    console.log(
      all
        ? `没有成员有 \`${script}\` 脚本，不需要跑。`
        : `没有受影响的成员，不需要跑 \`${script}\` 的${TIER_NAMES[tier]}。`,
    )
    return 0
  }

  const runDir = resolve(
    request.out ??
      join(
        ledgerHome(script, at.mainRoot, process.env),
        `${at.shortHead}${at.dirty ? '-dirty' : ''}`,
        `${timestamp(new Date())}${tier === 'all' ? '' : `-${tier}`}`,
      ),
  )
  mkdirSync(runDir, { recursive: true })

  if (request.build && !buildTargets(ROOT, targets, runDir)) return 1

  const meta = {
    script,
    tier,
    head: at.head,
    branch: at.branch,
    dirty: at.dirty,
    base: at.base ?? null,
    startedAt: new Date().toISOString(),
    parallel,
    cores: availableParallelism(),
    plan: plan ?? null,
    members: targets.map(member => member.path),
  }
  console.log(
    `跑 ${targets.length} 个成员的 \`${script}\`${script === 'test' ? `（${TIER_NAMES[tier]}）` : ''}：` +
      `同时 ${parallel.memberConcurrency} 个成员、每个至多 ${parallel.vitestMaxWorkers} 个工作进程（本机 ${meta.cores} 核）`,
  )
  const started = Date.now()
  const runs = await runMembers(ROOT, targets, runDir, parallel, script, tier, (done, finished) => {
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

  const ledger = buildLedger(runs, ROOT, config.ledger.nearTimeoutRatio)
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

/**
 * 合并前的测试一步（负责人 2026-10-02 定）：全部成员的快层，再加基线以来受影响成员的慢层；两次各写一份账本。
 * 没被选中的成员的慢层不在这里跑——合并后在主线头补跑全量慢层（`make test-tier TIER=slow`）。
 */
async function gate(argv: readonly string[]): Promise<number> {
  const flags = parseFlags(argv, ['--base'], [])
  const fromEnv = process.env['BASELINE']
  const base =
    flags.values.get('--base') ?? (fromEnv === undefined || fromEnv === '' ? 'main' : fromEnv)
  const common = { script: 'test', build: false, planOnly: false, out: undefined } as const
  console.log(`合并前测试：全部成员的快层，再加受影响成员（基线 ${base}）的慢层`)
  const fast = await run({ ...common, base: undefined, tier: 'fast' })
  const slow = await run({ ...common, base, tier: 'slow' })
  return fast === 0 && slow === 0 ? 0 : 1
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
  if (command === 'run') process.exitCode = await run(parseRun(rest))
  else if (command === 'gate') process.exitCode = await gate(rest)
  else if (command === 'triage') process.exitCode = await runTriage(rest)
  else throw new Error(`未知命令 ${String(command)}\n${USAGE}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
})
