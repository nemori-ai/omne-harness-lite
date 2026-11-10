// 三个命令的流程：取 Git 事实、分组、调执行器、打印。进程、Git 与配置都从 Deps 进来，用例换成假的。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ReadingConfig } from './config.ts'
import { groupByMember, inScope } from './members.ts'
import { buildArgs, measureMember, metricsSummary, type MemberReading } from './metrics.ts'
import {
  DEFAULT_MAX_LINES,
  mutateAll,
  mutateMember,
  mutationExitCode,
  mutationLines,
  planLines,
  upstreamBuildArgs,
  type MemberMutation,
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
  const summary = metricsSummary(readings, grouping, context)
  writeFileSync(join(outDir, 'summary.md'), `${summary.join('\n')}\n`)
  for (const line of summary) deps.print(line)
  deps.print('')
  deps.print(`每成员读数 JSON（摘要在 ${join(outDir, 'summary.md')}）：`)
  for (const reading of readings) deps.print(`- ${reading.member}：${reading.json}`)
  return readings.some(reading => reading.error !== undefined) ? 1 : 0
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
  const { repo } = deps
  const base = repo.mergeBase(requireBase(options))
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
  for (const member of members)
    plans.push(await mutateMember(member, context, { planOnly: true, otherHeavyTasks: 0 }))
  const lineCount = (path: string) => (repo.read(path) ?? '').split('\n').length
  const plan = planLines(plans, lineCount, options.maxLines ?? DEFAULT_MAX_LINES)
  deps.print(`差分变异范围：基线 ${base.slice(0, 9)} 到工作树；只跑快层`)
  for (const line of plan.lines) deps.print(line)
  if (plans.some(p => p.result === undefined)) return 1
  if (plan.over) return USAGE
  if (options.planOnly || members.length === 0) return 0
  if (!(await build(deps, upstreamBuildArgs(members.map(member => member.name))))) return 1
  const results = await mutateAll(members, context)
  for (const line of mutationLines(results)) deps.print(line)
  return mutationExitCode(results)
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
