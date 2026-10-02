// 测试运行入口：`run` 算受影响范围并跑测试（`--script acceptance` 改跑可执行验收）、写耗时账本；
// `triage` 对一次运行里的失败做隔离重跑。
// `run` 的退出码只反映测试是否全过；`triage` 只报告，退出码非零表示工具自己出错。
import { spawnSync } from 'node:child_process'
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
  ledgerHome,
  readTestRunsConfig,
  RUN_SCRIPTS,
  type RunScript,
} from './config.ts'
import { buildLedger, ledgerSummary, type Failure, type LedgerFile } from './ledger.ts'
import { runMembers, slugOf } from './run.ts'
import { triage, triageSummary } from './triage.ts'

const USAGE = [
  '用法：',
  '  run (--base <ref> | --all) [--script test|acceptance] [--plan-only] [--no-build | --build] [--out <dir>]',
  '      --base 先构建受影响的成员及其依赖（--no-build 跳过）；--all 不构建（调用方先构建），除非给 --build',
  '  triage --run <运行目录>',
].join('\n')

const ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))

interface Flags {
  readonly values: ReadonlyMap<string, string>
  readonly switches: ReadonlySet<string>
}

function parseFlags(
  argv: readonly string[],
  valued: readonly string[],
  switches: readonly string[],
): Flags {
  const values = new Map<string, string>()
  const seen = new Set<string>()
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? ''
    if (switches.includes(arg)) seen.add(arg)
    else if (valued.includes(arg)) {
      const value = argv[index + 1]
      if (value === undefined || value === '') throw new Error(`${arg} 需要一个值`)
      values.set(arg, value)
      index += 1
    } else throw new Error(`未知参数 ${arg}\n${USAGE}`)
  }
  return { values, switches: seen }
}

function timestamp(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  )
}

/** 测试跑的是依赖的 dist：把目标成员连同它们的依赖构建一遍。构建失败返回 false，日志落在运行目录。 */
function buildTargets(targets: readonly TestMember[], runDir: string): boolean {
  const started = Date.now()
  process.stdout.write(`构建 ${targets.length} 个成员及其依赖 …`)
  const built = spawnSync(
    'pnpm',
    [...targets.flatMap(member => ['--filter', `${member.name}...`]), 'run', 'build'],
    { cwd: ROOT, encoding: 'utf8' },
  )
  const buildLog = join(runDir, 'build.log')
  writeFileSync(buildLog, `${built.stdout}${built.stderr}`)
  console.log(` ${Math.round((Date.now() - started) / 1000)} 秒`)
  if (built.status === 0) return true
  console.log(`构建失败（退出码 ${built.status ?? -1}），没有运行。日志：${buildLog}`)
  return false
}

function scriptOf(flags: Flags): RunScript {
  const script = flags.values.get('--script') ?? 'test'
  if (!isRunScript(script)) throw new Error(`--script 只能是 ${RUN_SCRIPTS.join('、')}\n${USAGE}`)
  return script
}

async function run(argv: readonly string[]): Promise<number> {
  const flags = parseFlags(
    argv,
    ['--base', '--out', '--script'],
    ['--all', '--plan-only', '--no-build', '--build'],
  )
  const base = flags.values.get('--base')
  const all = flags.switches.has('--all')
  if ((base === undefined) === !all) throw new Error(`--base 与 --all 二选一\n${USAGE}`)
  if (flags.switches.has('--build') && flags.switches.has('--no-build'))
    throw new Error(`--build 与 --no-build 不能同时给\n${USAGE}`)
  const script = scriptOf(flags)

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
  if (flags.switches.has('--plan-only')) return 0
  if (targets.length === 0) {
    console.log(
      all
        ? `没有成员有 \`${script}\` 脚本，不需要跑。`
        : `没有受影响的成员，不需要跑 \`${script}\`。`,
    )
    return 0
  }

  const runDir = resolve(
    flags.values.get('--out') ??
      join(
        ledgerHome(script, at.mainRoot, process.env),
        `${at.shortHead}${at.dirty ? '-dirty' : ''}`,
        timestamp(new Date()),
      ),
  )
  mkdirSync(runDir, { recursive: true })

  // 受影响范围的运行自己构建；全量运行由调用方先构建，除非要求它构建。
  const build = all ? flags.switches.has('--build') : !flags.switches.has('--no-build')
  if (build && !buildTargets(targets, runDir)) return 1

  const meta = {
    script,
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
    `跑 ${targets.length} 个成员的 \`${script}\`：同时 ${parallel.memberConcurrency} 个成员、每个至多 ${parallel.vitestMaxWorkers} 个工作进程（本机 ${meta.cores} 核）`,
  )
  const started = Date.now()
  const runs = await runMembers(ROOT, targets, runDir, parallel, script, (done, finished) => {
    const tests = done.report?.testResults.reduce(
      (sum, file) => sum + file.assertionResults.length,
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

  const ledger = buildLedger(runs, ROOT, config.ledger.slowTestSeconds)
  const summary = ledgerSummary(ledger, {
    wallSeconds,
    slowFileSeconds: config.ledger.slowFileSeconds,
    slowTestSeconds: config.ledger.slowTestSeconds,
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
  if (command === 'run') process.exitCode = await run(rest)
  else if (command === 'triage') process.exitCode = await runTriage(rest)
  else throw new Error(`未知命令 ${String(command)}\n${USAGE}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
})
