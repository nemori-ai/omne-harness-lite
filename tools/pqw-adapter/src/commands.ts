// 三个命令的流程：取 Git 事实、分组、调执行器、打印。进程、Git 与配置都从 Deps 进来，用例换成假的。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ReadingConfig } from './config.ts'
import { groupByMember, inScope, type ChangedMember } from './members.ts'
import { buildArgs, measureMember, metricsSummary, type MemberReading } from './metrics.ts'
import {
  DEFAULT_MAX_LINES,
  mutateAll,
  mutateMember,
  mutationExitCode,
  mutationLines,
  planLines,
  rangeLines,
  upstreamBuildArgs,
  type MemberMutation,
  type MutationContext,
} from './mutation.ts'
import { parseOptions, UsageError, type Options } from './options.ts'
import type { Executor } from './process.ts'
import type { Repo } from './repo.ts'
import { classify, publicEntriesOf, riskLines, toolchainPathspecs } from './risk.ts'

export interface Deps {
  readonly repo: Repo
  readonly exec: Executor
  readonly print: (line: string) => void
  /** 产物目录的上级，缺省是系统临时目录：lcov 与 JSON 写在工作树外。 */
  readonly scratch: string
  /** 可用的逻辑 CPU 数。 */
  readonly cpus: number
  readonly config: () => ReadingConfig
}

/** 用法错误退出 2，与 pqw 两个脚本相同。 */
const USAGE = 2

function requireBase(options: Options): string {
  if (options.base === undefined) throw new UsageError('要给 --base <起点>')
  return options.base
}

function outDirOf(
  deps: Deps,
  options: Options,
  head: string,
  dirty: boolean,
  kind: string,
): string {
  const dir =
    options.out ??
    join(deps.scratch, 'omne-closeout', `${head.slice(0, 9)}${dirty ? '-dirty' : ''}`, kind)
  mkdirSync(dir, { recursive: true })
  return dir
}

async function build(deps: Deps, args: string[]): Promise<boolean> {
  const outcome = await deps.exec({ command: 'pnpm', args, cwd: deps.repo.root })
  if (outcome.code === 0) return true
  deps.print(`构建失败（pnpm ${args.join(' ')} 退出 ${outcome.code ?? '信号'}）：`)
  deps.print((outcome.stderr.trim() || outcome.stdout.trim()).split('\n').slice(-10).join('\n'))
  return false
}

/** 成员外改动那一份读数的名字。 */
const OUTSIDE = '成员外'

export async function closeoutMetrics(argv: readonly string[], deps: Deps): Promise<number> {
  const options = parseOptions(argv, ['--base', '--scope', '--full', '--out', '--workers'])
  const { repo } = deps
  const base = repo.mergeBase(requireBase(options))
  const head = repo.head()
  const dirty = repo.dirty()
  const grouping = groupByMember(repo.changedFiles(base), repo.members(), options.scopes)
  const config = deps.config()
  const outDir = outDirOf(deps, options, head, dirty, 'metrics')
  const testable = grouping.members.filter(member => member.testable)
  if (testable.length > 0 && !(await build(deps, buildArgs(testable.map(member => member.name)))))
    return 1
  const context = {
    root: repo.root,
    base,
    head,
    dirty,
    full: options.full,
    config,
    outDir,
    workers: options.workers ?? Math.max(1, Math.floor(deps.cpus / 2)),
    exec: deps.exec,
  }
  const readings: MemberReading[] = []
  for (const member of grouping.members) readings.push(await measureMember(member, context))
  // 成员外的改动（脚本、技能自带的脚本等）没有测试可跑，照样交给 pqw 量复杂度，不丢掉。
  if (grouping.outside.length > 0)
    readings.push(
      await measureMember(
        {
          path: OUTSIDE,
          name: OUTSIDE,
          testable: false,
          files: grouping.outside,
          scopes: grouping.outside,
        },
        context,
      ),
    )
  const summary = metricsSummary(readings, grouping, context)
  writeFileSync(join(outDir, 'summary.md'), `${summary.join('\n')}\n`)
  for (const line of summary) deps.print(line)
  deps.print('')
  deps.print(`每成员读数 JSON（摘要在 ${join(outDir, 'summary.md')}）：`)
  for (const reading of readings) deps.print(`- ${reading.member}：${reading.json}`)
  return readings.some(reading => reading.error !== undefined) ? 1 : 0
}

/** 列范围的结果：参与的成员、各成员的范围计划、合计与上限的判断、读文件行数的函数、跑变异要的上下文。 */
interface MutationRange {
  readonly members: readonly ChangedMember[]
  readonly plans: readonly MemberMutation[]
  readonly plan: ReturnType<typeof planLines>
  readonly lineCount: (path: string) => number
  readonly context: MutationContext
}

/** 第一步：列出每个成员的变异范围，打印并按上限判断；还没有跑变异。 */
async function listRange(deps: Deps, options: Options, base: string): Promise<MutationRange> {
  const { repo } = deps
  const head = repo.head()
  // 点名的文件不论改没改都打，所以它们所在的成员也算改动成员，它们本身也进范围。
  const changed = repo.changedFiles(base).filter(path => inScope(path, options.scopes))
  const scopes = options.scopes.length === 0 ? [] : [...options.scopes, ...options.files]
  const grouping = groupByMember(
    [...new Set([...changed, ...options.files])],
    repo.members(),
    scopes,
  )
  const outDir = outDirOf(deps, options, head, repo.dirty(), 'mutation')
  const context = { root: repo.root, base, files: options.files, outDir, exec: deps.exec }
  const untestable = grouping.members.filter(member => !member.testable)
  if (untestable.length > 0)
    deps.print(`没有 test 脚本、不变异：${untestable.map(member => member.path).join('、')}`)
  const members = grouping.members.filter(member => member.testable)
  const plans: MemberMutation[] = []
  for (const member of members) plans.push(await mutateMember(member, context, { planOnly: true }))
  const lineCount = (path: string) => (repo.read(path) ?? '').split('\n').length
  const plan = planLines(plans, lineCount, options.maxLines ?? DEFAULT_MAX_LINES)
  deps.print(`差分变异范围：基线 ${base.slice(0, 9)} 到工作树；只跑快层`)
  for (const line of plan.lines) deps.print(line)
  return { members, plans, plan, lineCount, context }
}

/** 第二步：构建上游，按范围行数分 CPU 跑各成员，打印汇总；返回退出码。 */
async function runMutation(deps: Deps, range: MutationRange): Promise<number> {
  const { members, plans, lineCount, context } = range
  if (!(await build(deps, upstreamBuildArgs(members.map(member => member.name))))) return 1
  const planned = members.map((member, index) => ({
    member,
    lines: rangeLines(plans[index]?.result?.mutate ?? [], lineCount),
  }))
  const results = await mutateAll(planned, context, deps.cpus)
  for (const line of mutationLines(results)) deps.print(line)
  return mutationExitCode(results)
}

export async function closeoutMutation(argv: readonly string[], deps: Deps): Promise<number> {
  const options = parseOptions(argv, [
    '--base',
    '--scope',
    '--files',
    '--plan-only',
    '--max-lines',
    '--out',
  ])
  const base = deps.repo.mergeBase(requireBase(options))
  const range = await listRange(deps, options, base)
  if (range.plans.some(p => p.result === undefined)) return 1
  if (range.plan.over) return USAGE
  if (options.planOnly || range.members.length === 0) return 0
  return runMutation(deps, range)
}

const TOOLCHAIN_LIST = 'gate/toolchain-paths.txt'
const TOOLCHAIN_REFS = ['origin/github-gate', 'github-gate']

export async function risk(argv: readonly string[], deps: Deps): Promise<number> {
  const options = parseOptions(argv, ['--base'])
  const { repo } = deps
  const base = repo.mergeBase(requireBase(options))
  const changed = repo.changedFiles(base)
  const list = TOOLCHAIN_REFS.map(ref => repo.show(ref, TOOLCHAIN_LIST)).find(
    text => text !== undefined,
  )
  const toolchain = list === undefined ? [] : repo.changedMatching(base, toolchainPathspecs(list))
  const publicEntries = new Set(
    repo.members().flatMap(member => {
      const text = repo.read(`${member.path}/package.json`)
      return text === undefined ? [] : publicEntriesOf(member.path, JSON.parse(text))
    }),
  )
  const missing =
    list === undefined
      ? `工具链路径（${TOOLCHAIN_REFS.join(' 与 ')} 上都没有 ${TOOLCHAIN_LIST}，先 git fetch）`
      : undefined
  const lines = riskLines(classify({ changed, toolchain, publicEntries }), {
    base,
    changed: changed.length,
    ...(missing === undefined ? {} : { missing }),
  })
  for (const line of lines) deps.print(line)
  return missing === undefined ? 0 : 1
}

/** 命令面调用的入口：用法错误退出 2，其余异常照抛。 */
export async function runCommand(
  command: (argv: readonly string[], deps: Deps) => Promise<number>,
  argv: readonly string[],
  deps: Deps,
): Promise<number> {
  try {
    return await command(argv, deps)
  } catch (error) {
    if (!(error instanceof UsageError)) throw error
    deps.print(error.message)
    return USAGE
  }
}

/** 命令面认得的三个命令，按第一个参数的名字选。 */
export const COMMANDS = { metrics: closeoutMetrics, mutation: closeoutMutation, risk }

/** 第一个参数是不是命令名：没给或认不出时命令面打印用法。 */
export function isCommandName(name: string | undefined): name is keyof typeof COMMANDS {
  return name !== undefined && name in COMMANDS
}

/** 打印用法后的退出码：只问 `--help` 是 0，没给命令或认不出命令是 2。 */
export function usageExitCode(name: string | undefined): 0 | 2 {
  return name === '--help' ? 0 : 2
}
