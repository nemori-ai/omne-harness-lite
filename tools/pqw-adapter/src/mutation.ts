// closeout:mutation：每个改动成员调一次 pqw mutation.mjs --project。先只列范围，超过上限就拒绝；
// 正式运行时成员之间按 pqw 自己的份额模型粗分 CPU（同时跑 K 个，各报 --other-heavy-tasks K-1）。
// 位点、Stryker 配置、沙箱预检、复核与增量全在 pqw，这里只拼参数、读回 JSON、汇总。
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FAST_VITEST_CONFIG, PQW_SCRIPTS, STRYKER_MODULES, slugOf } from './locations.ts'
import type { ChangedMember } from './members.ts'
import type { Executor, Outcome } from './process.ts'

/** 同时跑的成员数上限。 */
export const MAX_PARALLEL_MEMBERS = 3

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
  readonly otherHeavyTasks: number
}

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
    '--other-heavy-tasks',
    String(call.otherHeavyTasks),
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
  readonly narrowed?: readonly { readonly file: string; readonly unit: string }[]
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
  run: { readonly planOnly: boolean; readonly otherHeavyTasks: number },
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

/** 按上限并发地跑；各成员报给 pqw 的「同机另有的重型任务数」是同时在跑的其余成员数。 */
export async function mutateAll(
  members: readonly ChangedMember[],
  context: MutationContext,
): Promise<MemberMutation[]> {
  const parallel = Math.max(1, Math.min(MAX_PARALLEL_MEMBERS, members.length))
  const results = new Map<number, MemberMutation>()
  let next = 0
  const lane = async () => {
    while (next < members.length) {
      const index = next++
      const member = members[index]
      if (member === undefined) return
      results.set(
        index,
        await mutateMember(member, context, { planOnly: false, otherHeavyTasks: parallel - 1 }),
      )
    }
  }
  await Promise.all(Array.from({ length: parallel }, lane))
  return [...results.entries()].sort(([a], [b]) => a - b).map(([, result]) => result)
}

/** 测量无效：pqw 判 valid 为 false，或调用本身失败。只列时 valid 为 null，不算无效。存活不算无效。 */
export const invalid = (m: MemberMutation): boolean =>
  m.error !== undefined || m.result?.summary.valid === false

export const mutationExitCode = (results: readonly MemberMutation[]): number =>
  results.some(invalid) ? 1 : 0

/** pqw 还没修、读的人要知道的限制；末行原样写出。 */
export const MUTATION_LIMITS: readonly string[] = [
  'pqw 没关 vitest 的 preParse，it.each 等生成名字的用例所在文件可能被滤掉，只由它们守的变异体会记成存活（omne #405）',
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
    const narrowed = plan.result.narrowed?.length ?? 0
    lines.push(
      `${plan.member}：${plan.result.mutate.length} 段、${count} 行${narrowed === 0 ? '' : `，收窄 ${narrowed} 个大单元`}`,
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

export function mutationLines(results: readonly MemberMutation[]): string[] {
  const lines: string[] = []
  for (const m of results) {
    const summary = m.result?.summary
    if (m.error !== undefined || summary === undefined) {
      lines.push(`${m.member}：测量无效（${m.error ?? '没有结果'}）`)
      continue
    }
    if (summary.valid === false) {
      lines.push(`${m.member}：测量无效（${summary.invalidReason ?? '原因未写'}），JSON ${m.json}`)
      continue
    }
    const score =
      summary.score === null || summary.score === undefined
        ? '无'
        : `${Math.round(summary.score * 100)}%`
    lines.push(
      `${m.member}：杀死 ${summary.killed ?? 0}、存活 ${summary.survived ?? 0}、无覆盖 ${summary.uncovered ?? 0}、未跑 ${summary.notRun ?? 0}；分数 ${score}；JSON ${m.json}`,
    )
    const survivors = m.result?.survivors ?? []
    if (survivors.length > 0) lines.push('存活：', ...survivors.map(site))
    const uncovered = (m.result?.sites ?? []).filter(s => s.verdict === 'uncovered')
    if (uncovered.length > 0) lines.push('无覆盖：', ...uncovered.map(site))
    const unmutated = m.result?.unmutated ?? []
    if (unmutated.length > 0)
      lines.push(
        '没有变异体的段：',
        ...unmutated.map(
          u => `- ${u.file}:${u.lines[0]}-${u.lines[1]}${u.unit ? ` ${u.unit}` : ''}：${u.reason}`,
        ),
      )
  }
  lines.push(`限制：${MUTATION_LIMITS.join('；')}`)
  return lines
}
