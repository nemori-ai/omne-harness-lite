// closeout:mutation：每个改动成员调一次 pqw mutation.mjs --project。先只列范围，超过上限就拒绝；
// 正式运行时按范围行数工作守恒地分 CPU：大的先开跑、多分进程，各成员的进程数之和不超过 CPU 数（mutateAll）。
// 位点、Stryker 配置、沙箱预检、复核与增量全在 pqw，这里只拼参数、读回 JSON、汇总。
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FAST_VITEST_CONFIG, PQW_SCRIPTS, STRYKER_MODULES, slugOf } from './locations.ts'
import type { ChangedMember } from './members.ts'
import type { Executor, Outcome } from './process.ts'

/** 缺省的范围上限（各成员 mutate 行数之和）；超过时要求用 --scope 收窄到关键位置，或用 --max-lines 显式放宽。 */
export const DEFAULT_MAX_LINES = 600

export interface MutationCall {
  readonly root: string
  readonly member: string
  readonly base: string
  readonly scopes: readonly string[]
  readonly files: readonly string[]
  readonly json: string
  readonly planOnly: boolean
  /** Stryker 的进程数，经 pqw 的 --workers 交过去；不给时 pqw 按整机 CPU 数取（只列范围时用不到）。 */
  readonly workers?: number
}

/**
 * 交给 pqw 的 --unit-max-lines：0 让每个单元都算「超过上限」，范围退化成改动行本身。
 * 差分变异回答「这次的改动有没有被测试守住」；改动行所在函数里没改的行，变异出来测的是改动之前的代码，
 * 它们的测试强度是旧的事实，存活要逐条处置就把旧欠账推给了这次改动。整个函数的测试强度归整仓健康读数。
 */
export const CHANGED_LINES_ONLY = 0

export function mutationArgs(call: MutationCall): string[] {
  return [
    join(call.root, PQW_SCRIPTS, 'mutation.mjs'),
    '--repo',
    call.root,
    '--project',
    call.member,
    '--base',
    call.base,
    '--scope',
    call.scopes.join(','),
    ...(call.files.length === 0 ? [] : ['--files', call.files.join(',')]),
    '--build-command',
    'pnpm run build',
    '--stryker-modules',
    join(call.root, STRYKER_MODULES),
    '--vitest-config',
    FAST_VITEST_CONFIG,
    '--unit-max-lines',
    String(CHANGED_LINES_ONLY),
    ...(call.workers === undefined ? [] : ['--workers', String(call.workers)]),
    '--json',
    call.json,
    ...(call.planOnly ? ['--plan-only'] : []),
  ]
}

/** 构建成员的上游（不含成员自己：pqw 在沙箱里用 --build-command 构建插桩后的成员）。 */
export function upstreamBuildArgs(names: readonly string[]): string[] {
  return [
    'exec',
    'turbo',
    'run',
    'build',
    '--output-logs=errors-only',
    ...names.map(name => `--filter=${name}^...`),
  ]
}

/** mutate 条目的行数：`路径:起-止` 记止减起加一；整份点名的文件按它的行数。 */
export function rangeLines(mutate: readonly string[], lineCount: (path: string) => number): number {
  return mutate.reduce((total, entry) => {
    const match = /^(.*):(\d+)-(\d+)$/u.exec(entry)
    return total + (match === null ? lineCount(entry) : Number(match[3]) - Number(match[2]) + 1)
  }, 0)
}

/** pqw 变异 JSON 里汇总要用的字段。 */
export interface PqwMutation {
  readonly mutate: readonly string[]
  readonly summary: {
    readonly killed?: number
    readonly survived?: number
    readonly uncovered?: number
    readonly notRun?: number
    readonly score?: number | null
    readonly valid: boolean | null
    readonly invalidReason?: string | null
  }
  readonly survivors?: readonly {
    file: string
    unit: string
    line: number
    original: string
    mutant: string
  }[]
  readonly sites?: readonly {
    file: string
    unit: string
    line: number
    original: string
    mutant: string
    verdict: string
  }[]
  readonly unmutated?: readonly {
    file: string
    lines: readonly [number, number]
    unit?: string
    reason: string
  }[]
}

export interface MemberMutation {
  readonly member: string
  readonly json: string
  readonly result?: PqwMutation
  /** mutation.mjs 非零退出或没写出 JSON 时的说明。 */
  readonly error?: string
}

const tail = (outcome: Outcome) =>
  (outcome.stderr.trim() || outcome.stdout.trim()).split('\n').slice(-3).join(' ⏎ ')

export interface MutationContext {
  readonly root: string
  readonly base: string
  readonly files: readonly string[]
  readonly outDir: string
  readonly exec: Executor
}

/** 调一个成员一次。退出 1 时 pqw 仍写 JSON（初跑或沙箱预检没过），照样读回，由 valid 判无效。 */
export async function mutateMember(
  member: ChangedMember,
  context: MutationContext,
  run: { readonly planOnly: boolean; readonly workers?: number },
): Promise<MemberMutation> {
  const json = join(
    context.outDir,
    `${slugOf(member.path)}.${run.planOnly ? 'plan' : 'mutation'}.json`,
  )
  const outcome = await context.exec({
    command: process.execPath,
    args: mutationArgs({
      root: context.root,
      member: member.path,
      base: context.base,
      scopes: member.scopes,
      files: context.files.filter(file => file.startsWith(`${member.path}/`)),
      json,
      ...run,
    }),
    cwd: context.root,
  })
  if (!existsSync(json) || (outcome.code !== 0 && outcome.code !== 1))
    return {
      member: member.path,
      json,
      error: `mutation.mjs 退出 ${outcome.code ?? '信号'}：${tail(outcome)}`,
    }
  return {
    member: member.path,
    json,
    result: JSON.parse(readFileSync(json, 'utf8')) as PqwMutation,
  }
}

/** 一个要变异的成员与它的范围行数（只列范围那一轮的 mutate 条目按 rangeLines 算）。 */
export interface PlannedMember {
  readonly member: ChangedMember
  readonly lines: number
}

/**
 * 开跑一个成员时给它的进程数：CPU 数按它的范围行数占还没跑完的成员（在跑的与没开跑的）范围行数之和的比例分，
 * 四舍五入，至少 1，不超过此刻空着的 CPU。
 */
export function workersFor(lines: number, unfinished: number, cpus: number, free: number): number {
  const share = unfinished > 0 ? Math.round((cpus * lines) / unfinished) : 1
  return Math.max(1, Math.min(free, share))
}

/**
 * 工作守恒地跑全部成员：范围大的先开跑，开跑时按 workersFor 分进程数，最后一个开跑的拿走空着的全部；
 * 在跑的进程数之和不超过 CPU 数，一个成员跑完，它的进程数立刻交给下一个。
 * Stryker 的并行度在启动时定下、运行中不调，所以大成员要在开跑时就拿到它那份。结果按传入的顺序返回。
 */
export function mutateAll(
  planned: readonly PlannedMember[],
  context: MutationContext,
  cpus: number,
): Promise<MemberMutation[]> {
  const order = planned.map((item, index) => ({ ...item, index })).sort((a, b) => b.lines - a.lines)
  const results: MemberMutation[] = []
  let free = cpus
  let unfinished = order.reduce((total, item) => total + item.lines, 0)
  let next = 0
  let running = 0
  return new Promise((resolve, reject) => {
    const start = () => {
      while (free > 0) {
        const item = order[next]
        if (item === undefined) break
        next += 1
        const workers =
          next === order.length ? free : workersFor(item.lines, unfinished, cpus, free)
        free -= workers
        running += 1
        mutateMember(item.member, context, { planOnly: false, workers }).then(result => {
          results[item.index] = result
          free += workers
          unfinished -= item.lines
          running -= 1
          start()
        }, reject)
      }
      if (next === order.length && running === 0) resolve(results)
    }
    start()
  })
}

/** 测量无效：pqw 判 valid 为 false，或调用本身失败。只列时 valid 为 null，不算无效。存活不算无效。 */
export const invalid = (m: MemberMutation): boolean =>
  m.error !== undefined || m.result?.summary.valid === false

export const mutationExitCode = (results: readonly MemberMutation[]): number =>
  results.some(invalid) ? 1 : 0

/** pqw 还没修、读的人要知道的限制；末行原样写出。 */
export const MUTATION_LIMITS: readonly string[] = [
  '增量指纹不含测试经相对路径读的成员外文件，它们变了要手动删指纹重跑',
]

export function planLines(
  plans: readonly MemberMutation[],
  lineCount: (path: string) => number,
  limit: number,
): { lines: string[]; total: number; over: boolean } {
  const lines: string[] = []
  let total = 0
  for (const plan of plans) {
    if (plan.result === undefined) {
      lines.push(`${plan.member}：列范围失败（${plan.error}）`)
      continue
    }
    const count = rangeLines(plan.result.mutate, lineCount)
    total += count
    lines.push(
      `${plan.member}：${plan.result.mutate.length} 段、${count} 行`,
      ...plan.result.mutate.map(entry => `  ${entry}`),
    )
  }
  const over = total > limit
  lines.push(
    `范围合计 ${total} 行，上限 ${limit}${over ? '：超过上限，拒绝运行。用 --scope 收窄到关键位置，或用 --max-lines 显式放宽' : ''}`,
  )
  return { lines, total, over }
}

const site = (s: { file: string; unit: string; line: number; original: string; mutant: string }) =>
  `- ${s.file}:${s.line} ${s.unit}：\`${s.original}\` → \`${s.mutant === '' ? '（删去）' : s.mutant}\``

/** 一个成员的汇总行：杀死、存活、无覆盖、未跑与分数，JSON 位置在末尾。 */
function scoreLine(m: MemberMutation, summary: PqwMutation['summary']): string {
  const score =
    summary.score === null || summary.score === undefined
      ? '无'
      : `${Math.round(summary.score * 100)}%`
  return `${m.member}：杀死 ${summary.killed ?? 0}、存活 ${summary.survived ?? 0}、无覆盖 ${summary.uncovered ?? 0}、未跑 ${summary.notRun ?? 0}；分数 ${score}；JSON ${m.json}`
}

/** 有条目时写「标题：」与各条目，没有就一行都不写。 */
function section(title: string, items: readonly string[]): string[] {
  return items.length === 0 ? [] : [title, ...items]
}

const unmutatedSite = (u: NonNullable<PqwMutation['unmutated']>[number]) =>
  `- ${u.file}:${u.lines[0]}-${u.lines[1]}${u.unit ? ` ${u.unit}` : ''}：${u.reason}`

/** 一个成员的输出：测量无效只一行；否则汇总行，再依次是存活、无覆盖、没有变异体的段。 */
function memberLines(m: MemberMutation): string[] {
  const summary = m.result?.summary
  if (m.error !== undefined || summary === undefined)
    return [`${m.member}：测量无效（${m.error ?? '没有结果'}）`]
  if (summary.valid === false)
    return [`${m.member}：测量无效（${summary.invalidReason ?? '原因未写'}），JSON ${m.json}`]
  return [
    scoreLine(m, summary),
    ...section('存活：', (m.result?.survivors ?? []).map(site)),
    ...section(
      '无覆盖：',
      (m.result?.sites ?? []).filter(s => s.verdict === 'uncovered').map(site),
    ),
    ...section('没有变异体的段：', (m.result?.unmutated ?? []).map(unmutatedSite)),
  ]
}

export function mutationLines(results: readonly MemberMutation[]): string[] {
  return [...results.flatMap(memberLines), `限制：${MUTATION_LIMITS.join('；')}`]
}
