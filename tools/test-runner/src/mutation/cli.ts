// 差分变异入口：只变异基线以来改动碰到的产品源码行（或点名成员的全部产品源码），逐成员跑 Stryker 的快层，
// 列出存活与无覆盖的变异体，读数写进主检出的 `tmp/mutation-ledger/`。
// 只报告（负责人 2026-10-02 定）：变异体存活不影响退出码；Stryker 起不来、初跑失败、没写出报告才退出非零。
import { baselines } from '@omne-harness/repo-toolchain/core/task-context'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { changedLines, coordinates, type Coordinates } from '@omne-harness/repo-toolchain/core/git'
import { listTestMembers } from '@omne-harness/repo-toolchain/core/workspace'
import { effectiveParallelism, readTestRunsConfig } from '../testing/config.ts'
import { buildTargets, parseFlags, timestamp, type Flags } from '../testing/support.ts'
import { computePlan, readPlanFile, writePlanFile, type PlanFile } from '../testing/steps.ts'
import { memberLines, summarizeMember, type MemberMutation, type MutationReport } from './report.ts'
import {
  changedTargets,
  memberTargets,
  mutateEntries,
  MUTATION_ROOTS,
  type MutationTarget,
} from './scope.ts'
import { runStryker } from './stryker.ts'

const USAGE = [
  '用法：',
  '  run [--base <ref> | --plan <计划文件> | --members <成员目录,…>] [--plan-only] [--root <检出根>] [--out <目录>]',
  '      三者都不给时同 --base，基线取任务上下文的基线，再缺省 main',
  '      --base 先按这个基线算计划（与 test-runner 的 plan 相同），变异合并点到工作树（含未提交、未跟踪）的改动',
  '      碰到的、计划里要跑测试的产品成员 src/ 下的源码行',
  '      --plan 读 test-runner 的 plan --json 写出的计划文件（准入检查用的那份），范围同 --base',
  '      --members 变异点名成员 src/ 下的全部源码（逗号分隔的仓库相对目录）',
].join('\n')

const DEFAULT_ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))
export const LEDGER_HOME_ENV = 'OMNE_MUTATION_LEDGER_HOME'

/** 变异范围从哪来：按基线现算计划、读计划文件，或点名成员。 */
type MutationScope =
  | { readonly kind: 'base'; readonly base: string }
  | { readonly kind: 'plan'; readonly path: string }
  | { readonly kind: 'members'; readonly members: readonly string[] }

interface MutationRequest {
  readonly root: string
  readonly scope: MutationScope
  readonly planOnly: boolean
  readonly out: string | undefined
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
  return { kind: 'base', base: baselines(root, flags.values.get('--base')).targetBase ?? 'main' }
}

function parseRun(argv: readonly string[]): MutationRequest {
  const flags = parseFlags(
    argv,
    ['--base', '--members', '--plan', '--root', '--out'],
    ['--plan-only'],
    USAGE,
  )
  const root = resolve(
    flags.values.get('--root') ?? process.env['OMNE_SUBJECT_ROOT'] ?? DEFAULT_ROOT,
  )
  return {
    root,
    scope: scopeOf(root, flags),
    planOnly: flags.switches.has('--plan-only'),
    out: flags.values.get('--out'),
  }
}

/** 选出的变异目标：点名成员的全部源码，或按计划（读计划文件或按基线现算）选出的改动行。 */
type Selection =
  | { readonly kind: 'members'; readonly targets: MutationTarget[] }
  | { readonly kind: 'planned'; readonly plan: PlanFile; readonly targets: MutationTarget[] }

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
  // 计划只核提交；算完计划后工作树又改了计划外的成员，就不静默跳过它们，要求重算。
  const planned = new Set(plan.plan.test)
  const targets = changedTargets(changedLines(request.root, plan.base.mergeBase), members)
  const unplanned = targets.filter(target => !planned.has(target.member.path))
  if (unplanned.length > 0)
    throw new Error(
      `计划之后工作树改了计划外的成员：${unplanned.map(target => target.member.path).join('、')}：重新算计划`,
    )
  return { kind: 'planned', plan, targets }
}

function ledgerDir(request: MutationRequest, at: Coordinates): string {
  if (request.out !== undefined) return resolve(request.out)
  const home = process.env[LEDGER_HOME_ENV]
  const base =
    home === undefined || home === '' ? join(at.mainRoot, 'tmp', 'mutation-ledger') : home
  return join(base, `${at.shortHead}${at.dirty ? '-dirty' : ''}`, timestamp(new Date()))
}

function readMutationReport(path: string): MutationReport | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as MutationReport
  } catch {
    return undefined
  }
}

async function run(request: MutationRequest): Promise<number> {
  const selection = select(request)
  const { targets } = selection
  const located = coordinates(request.root, undefined)
  const at: Coordinates =
    selection.kind === 'planned' ? { ...located, base: selection.plan.base } : located
  if (targets.length === 0) {
    console.log(
      selection.kind === 'members'
        ? '没有可变异的改动：点名成员的 src/ 下没有源码'
        : `没有可变异的改动：基线 ${selection.plan.base.ref} 以来，计划里 ${MUTATION_ROOTS.join('、')} 下成员的 src/ 里没有改动的源码`,
    )
    return 0
  }
  const scope =
    selection.kind === 'members'
      ? `点名成员的全部产品源码`
      : `基线 ${selection.plan.base.ref}（合并点 ${selection.plan.base.mergeBase.slice(0, 9)}）以来改动碰到的产品源码行`
  console.log(`变异范围：${scope}；只跑快层（vitest 的 mode 为 fast）`)
  for (const target of targets)
    console.log(
      `  ${target.member.path}：${target.lines.size} 个文件，${mutateEntries(target).length} 段`,
    )
  if (request.planOnly) return 0

  const runDir = ledgerDir(request, at)
  mkdirSync(runDir, { recursive: true })
  if (selection.kind === 'planned') writePlanFile(join(runDir, 'plan.json'), selection.plan)
  if (
    !buildTargets(
      request.root,
      targets.map(target => target.member),
      runDir,
    )
  )
    return 1
  const config = readTestRunsConfig()
  const strykerRun = {
    root: request.root,
    runDir,
    concurrency: effectiveParallelism(config, process.env).vitestMaxWorkers,
    testTimeoutSeconds: config.mutation.testTimeoutSeconds,
    nonce: `${process.pid}`,
  }
  const results: MemberMutation[] = []
  const errors: string[] = []
  for (const [index, target] of targets.entries()) {
    const ran = await runStryker(target, strykerRun)
    const report = readMutationReport(ran.reportPath)
    const label = `[${index + 1}/${targets.length}] ${target.member.path} ${Math.round(ran.wallSeconds)} 秒`
    if (ran.exitCode !== 0 || report === undefined) {
      errors.push(
        `${target.member.path}：Stryker 退出码 ${ran.exitCode}${report === undefined ? '，没有写出报告' : ''}，日志 ${ran.logPath}`,
      )
      console.log(`${label}，出错`)
      continue
    }
    const result = summarizeMember(target, report)
    results.push(result)
    console.log(`${label}，存活 ${result.counts.Survived}、无覆盖 ${result.counts.NoCoverage}`)
  }

  const summary = [
    `变异范围：${scope}；只跑快层（vitest 的 mode 为 fast）；提交 ${at.shortHead}${at.dirty ? '（工作树有未提交改动）' : ''}`,
    ...results.flatMap(result => memberLines(result, true)),
    ...errors.map(error => `出错 ${error}`),
    '存活、无覆盖只是线索：判定会抖，要复跑确认；static 变异体只能跑全部测试；没改的代码不在范围内。',
    `账本与各成员日志：${runDir}`,
  ]
  writeFileSync(
    join(runDir, 'summary.json'),
    `${JSON.stringify({ head: at.head, dirty: at.dirty, base: at.base ?? null, members: results, errors }, null, 1)}\n`,
  )
  writeFileSync(join(runDir, 'summary.md'), `${summary.join('\n')}\n`)
  console.log(summary.join('\n'))
  return errors.length === 0 ? 0 : 1
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
