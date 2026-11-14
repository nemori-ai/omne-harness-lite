import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FAST_VITEST_CONFIG, STRYKER_MODULES, pqwScripts, slugOf } from './locations.ts'
import type { ChangedMember } from './members.ts'
import type { Executor, Outcome } from './process.ts'

export const DEFAULT_MAX_LINES = 600

export interface MutationCall {
  readonly root: string
  readonly member: string
  readonly base: string
  readonly scopes: readonly string[]
  readonly files: readonly string[]
  readonly json: string
  readonly planOnly: boolean
  readonly workers?: number
}

export function mutationArgs(call: MutationCall): string[] {
  return [
    join(pqwScripts(call.root), 'mutation.mjs'),
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
    ...(call.workers === undefined ? [] : ['--workers', String(call.workers)]),
    '--json',
    call.json,
    ...(call.planOnly ? ['--plan-only'] : []),
  ]
}

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

export function rangeLines(mutate: readonly string[], lineCount: (path: string) => number): number {
  return mutate.reduce((total, entry) => {
    const match = /^(.*):(\d+)-(\d+)$/u.exec(entry)
    return total + (match === null ? lineCount(entry) : Number(match[3]) - Number(match[2]) + 1)
  }, 0)
}

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

export interface PlannedMember {
  readonly member: ChangedMember
  readonly lines: number
}

export function workersFor(lines: number, unfinished: number, cpus: number, free: number): number {
  const share = unfinished > 0 ? Math.round((cpus * lines) / unfinished) : 1
  return Math.max(1, Math.min(free, share))
}

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

export const invalid = (m: MemberMutation): boolean =>
  m.error !== undefined || m.result?.summary.valid === false

export const mutationExitCode = (results: readonly MemberMutation[]): number =>
  results.some(invalid) ? 1 : 0

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

function scoreLine(m: MemberMutation, summary: PqwMutation['summary']): string {
  const score =
    summary.score === null || summary.score === undefined
      ? '无'
      : `${Math.round(summary.score * 100)}%`
  return `${m.member}：杀死 ${summary.killed ?? 0}、存活 ${summary.survived ?? 0}、无覆盖 ${summary.uncovered ?? 0}、未跑 ${summary.notRun ?? 0}；分数 ${score}；JSON ${m.json}`
}

function section(title: string, items: readonly string[]): string[] {
  return items.length === 0 ? [] : [title, ...items]
}

const unmutatedSite = (u: NonNullable<PqwMutation['unmutated']>[number]) =>
  `- ${u.file}:${u.lines[0]}-${u.lines[1]}${u.unit ? ` ${u.unit}` : ''}：${u.reason}`

function detailLines(result: PqwMutation | undefined): string[] {
  return [
    ...section('存活：', (result?.survivors ?? []).map(site)),
    ...section('无覆盖：', (result?.sites ?? []).filter(s => s.verdict === 'uncovered').map(site)),
    ...section('没有变异体的段：', (result?.unmutated ?? []).map(unmutatedSite)),
  ]
}

function memberLines(m: MemberMutation): string[] {
  const summary = m.result?.summary
  if (m.error !== undefined || summary === undefined)
    return [`${m.member}：测量无效（${m.error ?? '没有结果'}）`]
  if (summary.valid === false)
    return [`${m.member}：测量无效（${summary.invalidReason ?? '原因未写'}），JSON ${m.json}`]
  return [scoreLine(m, summary), ...detailLines(m.result)]
}

export function mutationLines(results: readonly MemberMutation[]): string[] {
  return [...results.flatMap(memberLines), `限制：${MUTATION_LIMITS.join('；')}`]
}
