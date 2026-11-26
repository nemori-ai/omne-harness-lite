import type { StateLabel, Tone } from '@omne-harness/ui-kit'
import { encodeInstant, type Instant } from '@omne-harness/utc-instant'
import type { Succeeded } from './words.ts'

export type HistoryRow = Succeeded<'list-jobs'>['items'][number]
export type SlotRow = Extract<HistoryRow, { kind: 'slot' }>
export type LapseRow = Extract<HistoryRow, { kind: 'lapse' }>
export type JobDetail = Succeeded<'read-job'>
export type JobCard = NonNullable<SlotRow['job']>

/** A word of the page, or a state the kit's table names, which reaches the page only through `StateWord`. */
export type Word = Readonly<
  { tone: Extract<Tone, 'neutral' | 'good' | 'caution' | 'danger'> } & (
    | { word: string; state?: never }
    | { state: Extract<StateLabel, 'failed' | 'cancelled'>; word?: never }
  )
>

/** Where a Job stands, in the words of the schedule page: a stop asked and not yet confirmed is waiting for it to stop. */
export function jobWord(job: Pick<JobCard, 'state' | 'outcome' | 'stop'>): Word {
  if (job.state === 'concluded') {
    if (job.outcome === 'succeeded') return { word: '完成', tone: 'good' }
    if (job.outcome === 'cancelled') return { state: 'cancelled', tone: 'neutral' }
    return { state: 'failed', tone: 'danger' }
  }
  if (job.stop !== 'none') return { word: '在等它停下', tone: 'neutral' }
  if (job.state === 'waiting') return { word: '等前一次', tone: 'neutral' }
  if (job.state === 'running') return { word: '执行中', tone: 'neutral' }
  if (job.state === 'blocked') return { word: '暂时受阻', tone: 'caution' }
  return { word: '待开始', tone: 'neutral' }
}

/** A slot the dispatcher disposed without a Job: skipped for an earlier run, missed, or refused. */
export function slotWord(row: SlotRow): Word {
  if (row.job !== null) return jobWord(row.job)
  if (row.disposition === 'skipped') return { word: '已跳过', tone: 'neutral' }
  if (row.disposition === 'rejected') return { word: '被拒绝', tone: 'danger' }
  return { word: '没有补', tone: 'neutral' }
}

const ms = (at: Instant) => Date.parse(encodeInstant(at))

export function spanText(from: number, to: number): string {
  const minutes = Math.floor(Math.max(0, to - from) / 60_000)
  if (minutes < 1) return '不到一分钟'
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分钟`
}

const SLOT_REASONS: Readonly<Record<string, string>> = {
  overlap: '上一次还没收场，按重叠的策略跳过',
  'reminder-window': '过了提醒的受理窗口',
  'owner-not-member': '所有者已不是这个租户的成员',
}

const INTERRUPTED = 'interrupted'

/** The one-sentence fact of a row that happened: how long it has run or took, caught up, or why it was not done. */
export function slotFact(row: SlotRow, now: number): string {
  const job = row.job
  if (job === null) return SLOT_REASONS[row.reason] ?? `原因：${row.reason}`
  const caughtUp = job.origin === 'catchUp' ? '补跑' : undefined
  const ran =
    job.reason === INTERRUPTED
      ? '服务停了，被中断'
      : job.startedAt === null
        ? undefined
        : job.endedAt === null
          ? `已跑 ${spanText(ms(job.startedAt), now)}`
          : `用时 ${spanText(ms(job.startedAt), ms(job.endedAt))}`
  return [caughtUp, ran].filter(part => part !== undefined).join(' · ')
}

const CAUSES: Readonly<Record<string, string>> = {
  stopped: '停机',
  paused: '暂停',
  recovered: '依赖恢复之前',
  takeover: '接管之前',
  enabled: '生效之前',
  resumed: '恢复之前',
}
const POLICIES: Readonly<Record<string, string>> = {
  'catch-up-none': '补跑的策略是不补',
  'catch-up-latest': '只补最近几次',
  'over-budget': '超出了计算的预算',
}

export function lapseText(row: LapseRow): string {
  const counted =
    row.count === null
      ? '这一段没有逐个算，都没有补'
      : row.count > 0
        ? `这一段共 ${row.count} 次没有补`
        : row.selected > 0
          ? `这一段的 ${row.selected} 次都补了`
          : '这一段没有到点的'
  const why = [CAUSES[row.cause] ?? row.cause, POLICIES[row.reason] ?? row.reason].join('，')
  return `${counted}（${why}）`
}

export const ORIGIN_WORDS: Readonly<Record<JobCard['origin'], string>> = {
  due: '到点受理',
  catchUp: '补跑',
  human: '你发起',
  agent: 'agent 发起',
  system: '系统发起',
}

/** Why a schedule cannot run now, and what lets it run again. */
export function blockedText(reasons: readonly string[]): string {
  const said = reasons.map(reason => {
    if (reason === 'carrier-missing:notification') return '这份安排要发通知，通知还没有接上'
    const program = /^carrier-missing:program:(.+)$/.exec(reason)
    if (program !== null) return `这份安排要跑的程序 ${program[1]} 还没有登记`
    if (reason.startsWith('carrier-missing:')) return '这份安排的工作还没有执行方'
    return `这份安排暂时不能运行（${reason}）`
  })
  return `${said.join('；')}。接上之后，受阻的这一段按漏过处理。`
}

const STEPS: Readonly<Record<string, string>> = {
  accepted: '受理',
  predecessorsQuiet: '前一次收场了',
  startIntent: '要开始',
  taken: '执行方接下了',
  notStarted: '没能开始',
  cancel: '要求取消',
  ended: '执行方报告收场',
  stopSent: '停止的要求送到了',
  stopConfirmed: '确认停下了',
  stopUnknown: '不知道停没停',
}

export function stepText(kind: string): string {
  return STEPS[kind] ?? kind
}

type Tree =
  | Readonly<{ kind: 'null' }>
  | Readonly<{ kind: 'boolean'; value: boolean }>
  | Readonly<{ kind: 'number'; lexeme: string }>
  | Readonly<{ kind: 'string'; value: string }>
  | Readonly<{ kind: 'array'; items: readonly Tree[] }>
  | Readonly<{ kind: 'object'; entries: readonly Readonly<{ key: string; value: Tree }>[] }>

export function plainOf(tree: unknown): unknown {
  const value = tree as Tree
  switch (value.kind) {
    case 'null':
      return null
    case 'boolean':
    case 'string':
      return value.value
    case 'number':
      return Number(value.lexeme)
    case 'array':
      return value.items.map(plainOf)
    case 'object':
      return Object.fromEntries(value.entries.map(entry => [entry.key, plainOf(entry.value)]))
  }
}

/** What the Job was fixed to do when it was accepted. */
export function requirementText(tree: unknown): string {
  const work = plainOf(tree) as {
    kind?: string
    programRef?: string
    input?: unknown
    instruction?: { purpose?: string }
  } | null
  if (work?.kind === 'program')
    return `程序 ${work.programRef ?? ''}，输入 ${JSON.stringify(work.input ?? {})}`
  if (work?.kind === 'agent') return work.instruction?.purpose ?? ''
  return '没有可读的要求'
}
