// 差分变异入口：只变异基线以来改动碰到的产品源码行（`--since` 再收窄到某个提交以来；或点名成员的全部产品源码），逐成员跑 Stryker 的快层，
// 列出存活与无覆盖的变异体，读数写进主检出的 `tmp/mutation-ledger/`。
// 只报告（负责人 2026-10-02 定）：变异体存活不影响退出码；Stryker 起不来、sandbox 预检没通过（#481）、初跑失败、
// 没写出报告、原始报告有 RuntimeError、有变异体有用例覆盖却一条用例都没跑完（#405），
// 或只因时限到了而超时的变异体没能单独复核（#649），才退出非零。测量无效的成员照样写进读数，不给分数。
import { resolveBaseline } from '@omne-harness/repo-toolchain/core/task-context'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { changedLines, coordinates, type Coordinates } from '@omne-harness/repo-toolchain/core/git'
import { listTestMembers } from '@omne-harness/repo-toolchain/core/workspace'
import {
  effectiveRecheckMax,
  readTestRunsConfig,
  VITEST_MAX_WORKERS_ENV,
  workerCountOverride,
} from '../testing/config.ts'
import { budgetFor, describeBudget } from '../testing/parallelism.ts'
import { buildTargets, parseFlags, timestamp, type Flags } from '../testing/support.ts'
import { computePlan, readPlanFile, writePlanFile, type PlanFile } from '../testing/steps.ts'
import {
  incrementalMode,
  INCREMENTAL_ENV,
  readStore,
  memberFingerprint,
  storePath,
  type Store,
} from './incremental.ts'
import { mutateMember, type MemberContext, type MemberOutcome } from './member.ts'
import { memberLines } from './report.ts'
import { planWorks, runWithinBudget, workerWarning } from './schedule.ts'
import {
  changedTargets,
  memberTargets,
  mutateEntries,
  MUTATION_ROOTS,
  type MutationTarget,
} from './scope.ts'
import { sinceRange, type SinceRange } from './since.ts'

const USAGE = [
  '用法：',
  '  run [--base <ref> | --plan <计划文件> | --members <成员目录,…>] [--plan-only] [--root <检出根>] [--out <目录>]',
  '      三者都不给时同 --base，基线按统一规则取：--base，再取环境变量 BASELINE，再取任务上下文的基线，再取 origin/main，最后取 main',
  '      --base 先按这个基线算计划（与 test-runner 的 plan 相同），变异合并点到工作树（含未提交、未跟踪）的改动',
  '      碰到的、计划里要跑测试的产品成员 src/ 下的源码行',
  '      --plan 读 test-runner 的 plan --json 写出的计划文件（准入检查用的那份），范围同 --base',
  '      --members 变异点名成员 src/ 下的全部源码（逗号分隔的仓库相对目录）',
  '  [--since <ref>]',
  '      只变异 <ref> 以来改动的行：仍按基线算计划，范围取 <ref> 与合并点各自到工作树的改动行的交；',
  '      <ref> 须是 HEAD 的祖先、不早于合并点，绑定了任务上下文的树里也能用；不能与 --members 同给',
  '  [--no-incremental | --force]',
  '      缺省复用同一分支上次运行里被杀、代码与杀死它的测试都没变的变异体（快照在主检出的 tmp/mutation-incremental/）',
  `      --no-incremental 或环境变量 ${INCREMENTAL_ENV}=0 不读也不写快照；--force 全部重跑，跑完照样更新快照`,
  '      成员之间在工作进程预算内并行；环境变量 OMNE_MUTATION_PARALLEL=0 让成员逐个跑，每个成员用整份预算',
].join('\n')

const DEFAULT_ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))
export const LEDGER_HOME_ENV = 'OMNE_MUTATION_LEDGER_HOME'
/** 设为 `0` 让成员逐个跑，每个成员的 Stryker 用整份预算（并行之前的做法）。 */
export const PARALLEL_ENV = 'OMNE_MUTATION_PARALLEL'

/** 变异范围从哪来：按基线现算计划、读计划文件，或点名成员。 */
type MutationScope =
  | { readonly kind: 'base'; readonly base: string }
  | { readonly kind: 'plan'; readonly path: string }
  | { readonly kind: 'members'; readonly members: readonly string[] }

interface MutationRequest {
  readonly root: string
  readonly scope: MutationScope
  /** `--since` 给的引用：在计划的范围里只留它以来改动的行。 */
  readonly since: string | undefined
  /** `run` 之后的原样参数，写进进程数告警里的重启命令。 */
  readonly args: readonly string[]
  readonly planOnly: boolean
  readonly out: string | undefined
  readonly noIncremental: boolean
  readonly force: boolean
}

function scopeOf(root: string, flags: Flags): MutationScope {
  const members = flags.values.get('--members')
  const plan = flags.values.get('--plan')
  const chosen = [flags.values.has('--base'), plan !== undefined, members !== undefined]
  if (chosen.filter(Boolean).length > 1)
    throw new Error(`--base、--plan 与 --members 只能给一个\n${USAGE}`)
  if (plan !== undefined) return { kind: 'plan', path: plan }
  if (members !== undefined)
    return {
      kind: 'members',
      members: members
        .split(',')
        .map(path => path.trim().replace(/\/+$/u, ''))
        .filter(path => path !== ''),
    }
  return { kind: 'base', base: resolveBaseline(root, flags.values.get('--base')).targetBase }
}

function parseRun(argv: readonly string[]): MutationRequest {
  const flags = parseFlags(
    argv,
    ['--base', '--members', '--plan', '--since', '--root', '--out'],
    ['--plan-only', '--no-incremental', '--force'],
    USAGE,
  )
  if (flags.switches.has('--no-incremental') && flags.switches.has('--force'))
    throw new Error(`--no-incremental 与 --force 只能给一个\n${USAGE}`)
  const since = flags.values.get('--since')
  if (since !== undefined && flags.values.has('--members'))
    throw new Error(
      `--since 与 --members 只能给一个：点名成员变异它的全部源码，没有基线以来的范围可收窄\n${USAGE}`,
    )
  const root = resolve(
    flags.values.get('--root') ?? process.env['OMNE_SUBJECT_ROOT'] ?? DEFAULT_ROOT,
  )
  return {
    root,
    scope: scopeOf(root, flags),
    since,
    args: argv,
    planOnly: flags.switches.has('--plan-only'),
    out: flags.values.get('--out'),
    noIncremental: flags.switches.has('--no-incremental'),
    force: flags.switches.has('--force'),
  }
}

/** 选出的变异目标：点名成员的全部源码，或按计划（读计划文件或按基线现算）选出的改动行。 */
type Selection =
  | { readonly kind: 'members'; readonly targets: MutationTarget[] }
  | {
      readonly kind: 'planned'
      readonly plan: PlanFile
      readonly targets: MutationTarget[]
      /** 给了 `--since` 时，收窄到的那个提交。 */
      readonly since: SinceRange | undefined
    }

function select(request: MutationRequest): Selection {
  const config = readTestRunsConfig()
  const members = listTestMembers(request.root, config.affected.excludeRoots)
  const { scope } = request
  if (scope.kind === 'members') {
    const named = scope.members.map(path => {
      const member = members.find(candidate => candidate.path === path)
      if (member === undefined) throw new Error(`${path} 不是带测试的 workspace 成员\n${USAGE}`)
      if (!MUTATION_ROOTS.some(root => path.startsWith(`${root}/`)))
        throw new Error(`${path} 不在 ${MUTATION_ROOTS.join('、')} 下：只变异产品源码\n${USAGE}`)
      return member
    })
    return { kind: 'members', targets: memberTargets(request.root, named) }
  }
  const plan =
    scope.kind === 'plan'
      ? readPlanFile(request.root, resolve(scope.path))
      : computePlan(request.root, scope.base, false)
  // 与准入检查读同一份计划：只变异计划里要跑测试的成员，改动行取计划的合并点。
  // 给了 `--since` 时基线不变，改动行再收窄到 `<ref>` 以来改过的（取值不能用时抛 SinceRefusal，以 2 退出）。
  // 计划只核提交；算完计划后工作树又改了计划外的成员，就不静默跳过它们，要求重算。
  const since =
    request.since === undefined
      ? undefined
      : sinceRange({ root: request.root, since: request.since, base: plan.base.ref })
  const planned = new Set(plan.plan.test)
  const targets = changedTargets(
    since?.lines ?? changedLines(request.root, plan.base.mergeBase),
    members,
  )
  const unplanned = targets.filter(target => !planned.has(target.member.path))
  if (unplanned.length > 0)
    throw new Error(
      `计划之后工作树改了计划外的成员：${unplanned.map(target => target.member.path).join('、')}：重新算计划`,
    )
  return { kind: 'planned', plan, targets, since }
}

function ledgerDir(request: MutationRequest, at: Coordinates): string {
  if (request.out !== undefined) return resolve(request.out)
  const home = process.env[LEDGER_HOME_ENV]
  const base =
    home === undefined || home === '' ? join(at.mainRoot, 'tmp', 'mutation-ledger') : home
  return join(base, `${at.shortHead}${at.dirty ? '-dirty' : ''}`, timestamp(new Date()))
}

async function run(request: MutationRequest): Promise<number> {
  const selection = select(request)
  const { targets } = selection
  const located = coordinates(request.root, undefined)
  const at: Coordinates =
    selection.kind === 'planned' ? { ...located, base: selection.plan.base } : located
  const sinceNote =
    selection.kind === 'planned' && selection.since !== undefined
      ? `、并且自 ${selection.since.commit.slice(0, 9)}（--since ${request.since}）以来`
      : ''
  if (targets.length === 0) {
    console.log(
      selection.kind === 'members'
        ? '没有可变异的改动：点名成员的 src/ 下没有源码'
        : `没有可变异的改动：基线 ${selection.plan.base.ref} 以来${sinceNote}，计划里 ${MUTATION_ROOTS.join('、')} 下成员的 src/ 里没有改动的源码`,
    )
    return 0
  }
  const scope =
    selection.kind === 'members'
      ? `点名成员的全部产品源码`
      : `基线 ${selection.plan.base.ref}（合并点 ${selection.plan.base.mergeBase.slice(0, 9)}）以来${sinceNote}改动碰到的产品源码行`
  console.log(`变异范围：${scope}；只跑快层（vitest 的 mode 为 fast）`)
  for (const target of targets)
    console.log(
      `  ${target.member.path}：${target.lines.size} 个文件，${mutateEntries(target).length} 段`,
    )
  if (request.planOnly) return 0

  const runDir = ledgerDir(request, at)
  mkdirSync(runDir, { recursive: true })
  if (selection.kind === 'planned') writePlanFile(join(runDir, 'plan.json'), selection.plan)
  const config = readTestRunsConfig()
  // Stryker 的工作进程各占一个核：成员们合起来用整份预算；VITEST_MAX_WORKERS 已设时以它为准（夹具靠它钉成一个进程）。
  const budget = await budgetFor(config.parallel)
  const concurrency = workerCountOverride(process.env, budget.workers)
  console.log(
    `Stryker 同时 ${concurrency} 个工作进程（${concurrency === budget.workers ? describeBudget(budget) : `环境变量 ${VITEST_MAX_WORKERS_ENV} 指定；${describeBudget(budget)}`}）`,
  )
  const warning = workerWarning(budget, process.env, request.args)
  if (warning !== undefined) console.log(warning)
  if (
    !buildTargets(
      request.root,
      targets.map(target => target.member),
      runDir,
      budget.workers,
    )
  )
    return 1
  const incremental = incrementalMode({
    disabled: request.noIncremental,
    force: request.force,
    mainRoot: at.mainRoot,
    branch: at.branch,
    env: process.env,
  })
  const fingerprints = new Map(
    targets.map(target => [
      target.member.path,
      memberFingerprint(request.root, target.member.path, config.mutation.testTimeoutSeconds),
    ]),
  )
  const stores = targets.map(target => {
    if (incremental.kind === 'off') return { store: undefined, notes: [] }
    const print = fingerprints.get(target.member.path)
    if (print === undefined || 'unavailable' in print)
      return { store: undefined, notes: [print?.unavailable ?? '没有指纹'] }
    const read = readStore(
      storePath(incremental.dir, target.member.path),
      print.fingerprint,
      print.parts,
    )
    return 'store' in read
      ? { store: read.store, notes: [] }
      : { store: undefined, notes: read.miss === '没有快照' ? [] : [read.miss] }
  })
  if (incremental.kind === 'on') {
    console.log(
      `增量：快照在 ${incremental.dir}${incremental.force ? '；--force：全部重跑，跑完更新快照' : ''}`,
    )
    for (const [index, { notes }] of stores.entries())
      for (const note of notes) console.log(`  ${targets[index]?.member.path}：${note}，整份重跑`)
  }
  const context: MemberContext = {
    strykerRun: {
      root: request.root,
      runDir,
      testTimeoutSeconds: config.mutation.testTimeoutSeconds,
      nonce: `${process.pid}`,
    },
    recheckMax: effectiveRecheckMax(config, process.env),
    testTimeoutSeconds: config.mutation.testTimeoutSeconds,
    incremental,
    fingerprints,
  }
  const label = (index: number) => `[${index + 1}/${targets.length}]`
  const mutateAt = (index: number, workers: number, store: Store | undefined) => {
    const target = targets[index]
    if (target === undefined) throw new Error(`没有第 ${index + 1} 个成员`)
    return mutateMember(target, workers, context, store, label(index))
  }
  let outcomes: MemberOutcome[]
  if (process.env[PARALLEL_ENV] === '0' || targets.length === 1) {
    outcomes = []
    for (const index of targets.keys())
      outcomes.push(await mutateAt(index, concurrency, stores[index]?.store))
  } else {
    const works = planWorks(
      targets.map((target, index) => {
        const meta = stores[index]?.store?.meta
        return {
          lines: scopeLines(request.root, target),
          ...(meta === undefined
            ? {}
            : { history: { workerSeconds: meta.workerSeconds, mutants: meta.mutants } }),
        }
      }),
      concurrency,
    )
    console.log(
      `${targets.length} 个成员并行，合起来不超过 ${concurrency} 个工作进程，` +
        `${works.basis === 'history' ? '按上次的耗时乘进程数分' : '没有每个成员上次的记录，平分'}；工作量大的先开始`,
    )
    outcomes = await runWithinBudget(concurrency, works.works, works.order, (index, workers) => {
      console.log(`  开始 ${label(index)} ${targets[index]?.member.path}：${workers} 个工作进程`)
      return mutateAt(index, workers, stores[index]?.store)
    })
  }

  const results = outcomes.flatMap(outcome =>
    outcome.result === undefined ? [] : [outcome.result],
  )
  const errors = outcomes.flatMap(outcome => outcome.errors)
  // 快照没读成的原因记在成员的增量情况里，与运行中的原因放在一起。
  const reuse = outcomes.flatMap((outcome, index) =>
    outcome.incremental === undefined
      ? []
      : [
          {
            ...outcome.incremental,
            notes: [...(stores[index]?.notes ?? []), ...outcome.incremental.notes],
          },
        ],
  )
  const summary = [
    `变异范围：${scope}；只跑快层（vitest 的 mode 为 fast）；提交 ${at.shortHead}${at.dirty ? '（工作树有未提交改动）' : ''}`,
    ...results.flatMap(result => memberLines(result, true)),
    ...errors.map(error => `出错 ${error}`),
    ...(incremental.kind === 'on'
      ? [
          `增量：复用上次被杀的变异体（不重跑）——${reuse.map(item => `${item.member} ${item.reused ?? '个数不明'}`).join('、')}` +
            `${incremental.force ? '（这次用了 --force，全部重跑）' : ''}；` +
            `复用只在被变异的代码与杀死它的测试都没变时发生；--no-incremental 或 ${INCREMENTAL_ENV}=0 关闭，--force 全部重跑`,
        ]
      : []),
    '存活、无覆盖只是线索：判定会抖，要复跑确认；static 变异体只能跑全部测试；没改的代码不在范围内。',
    `账本与各成员日志：${runDir}`,
  ]
  writeFileSync(
    join(runDir, 'summary.json'),
    `${JSON.stringify(
      {
        head: at.head,
        dirty: at.dirty,
        base: at.base ?? null,
        ...(selection.kind === 'planned' && selection.since !== undefined
          ? { since: { ref: request.since, commit: selection.since.commit } }
          : {}),
        members: results,
        errors,
        ...(incremental.kind === 'on'
          ? { incremental: { dir: incremental.dir, force: incremental.force, members: reuse } }
          : {}),
      },
      null,
      1,
    )}\n`,
  )
  writeFileSync(join(runDir, 'summary.md'), `${summary.join('\n')}\n`)
  console.log(summary.join('\n'))
  return errors.length === 0 ? 0 : 1
}

/** 要变异的行数：整份变异的文件按它的行数算，读不出按 1 行。 */
function scopeLines(root: string, target: MutationTarget): number {
  return [...target.lines].reduce(
    (sum, [path, ranges]) =>
      sum +
      ranges.reduce((lines, [start, end]) => {
        if (end !== Number.POSITIVE_INFINITY) return lines + end - start + 1
        try {
          return lines + readFileSync(join(root, path), 'utf8').split('\n').length
        } catch {
          return lines + 1
        }
      }, 0),
    0,
  )
}

async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv
  if (command !== 'run') throw new Error(USAGE)
  return run(parseRun(rest))
}

try {
  process.exitCode = await main(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
}
