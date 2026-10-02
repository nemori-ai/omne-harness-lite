// 流程体检的八块数据：卡的前置时间、每周接受数、各 topic 剩余卡数、主线提交的大小、全量测试的墙钟、
// 债的走向、对照表条数、各传感器最近一次有数据。全是纯函数：读文件、跑 git 在 health-cli.ts，
// 「现在」由调用方注入。每一块要么有数据，要么写明没有数据的原因。
import { shapeOf } from '../metrics/git.ts'
import { isRunTier, type RunTier } from '../testing/config.ts'
import type { Band, Lines } from './bands.ts'
import type { CardEntry } from './cards.ts'
import { CATEGORIES, type Category } from './catalogue.ts'
import { BUDGET_ITEMS, INDICATORS, type BudgetItem, type LoopConfig } from './config.ts'
import { data, noData, type Reading } from './reading.ts'
import type { StoryCard, TopicStories } from '../product/stories.ts'
import type { Snapshot } from './trend.ts'

const HOUR = 60 * 60 * 1000

/**
 * 中位数：偶数个取中间两个里较小的那个，与结构度量的提交形状（`shapeOf`）同一取法——
 * 总是台账里真实出现过的一个值。
 */
export function median(values: readonly number[]): number | undefined {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor((sorted.length - 1) / 2)]
}

// ---- 卡 ----

/** 两个时间点之间：走完了是相隔几小时；还没走完是自 proposed 起已过去几小时。 */
export type Span =
  | { readonly kind: 'done'; readonly hours: number }
  | { readonly kind: 'open'; readonly elapsedHours: number }
  /** 台账里没有 proposed（手工改过文件），算不出。 */
  | { readonly kind: 'unknown' }

export interface CardRow {
  readonly card: string
  /** 在某个 stories.md 里找到时才有。 */
  readonly title?: string
  readonly topic?: string
  readonly proposed?: string
  readonly runnable?: string
  readonly accepted?: string
  readonly toRunnable: Span
  readonly toAccepted: Span
}

export interface CardsBlock {
  readonly rows: readonly CardRow[]
  /** 接受过的卡从提出到接受的小时数。 */
  readonly leadTime: Reading<{
    readonly count: number
    readonly medianHours: number
    readonly maxHours: number
  }>
}

function span(from: string | undefined, to: string | undefined, now: Date): Span {
  if (from === undefined) return { kind: 'unknown' }
  if (to === undefined)
    return { kind: 'open', elapsedHours: (now.getTime() - Date.parse(from)) / HOUR }
  return { kind: 'done', hours: (Date.parse(to) - Date.parse(from)) / HOUR }
}

export function cardsBlock(
  entries: readonly CardEntry[],
  titles: ReadonlyMap<string, { readonly title: string; readonly topic: string }>,
  now: Date,
  ledgerPath: string,
): Reading<CardsBlock> {
  if (entries.length === 0)
    return noData(`台账 ${ledgerPath} 里还没有记录（用 make loop-card 登记）`)
  const byCard = new Map<string, Partial<Record<CardEntry['event'], string>>>()
  for (const entry of entries) {
    const events = byCard.get(entry.card) ?? {}
    events[entry.event] ??= entry.at
    byCard.set(entry.card, events)
  }
  const rows: CardRow[] = [...byCard].map(([card, events]) => {
    const found = titles.get(card)
    return {
      card,
      ...(found === undefined ? {} : { title: found.title, topic: found.topic }),
      ...events,
      toRunnable: span(events.proposed, events.runnable, now),
      toAccepted: span(events.proposed, events.accepted, now),
    }
  })
  const proposedAt = (row: CardRow) =>
    row.proposed === undefined ? Number.POSITIVE_INFINITY : Date.parse(row.proposed)
  rows.sort((a, b) => proposedAt(a) - proposedAt(b) || a.card.localeCompare(b.card))
  const lead = rows.flatMap(row => (row.toAccepted.kind === 'done' ? [row.toAccepted.hours] : []))
  return data({
    rows,
    leadTime:
      lead.length === 0
        ? noData('还没有走完 proposed → accepted 的卡')
        : data({ count: lead.length, medianHours: median(lead) ?? 0, maxHours: Math.max(...lead) }),
  })
}

// ---- 每周接受数 ----

export interface WeekCount {
  /** 这一周的周一，本机时区，`YYYY-MM-DD`。 */
  readonly start: string
  readonly accepted: number
}

const pad = (value: number) => String(value).padStart(2, '0')
export const localDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/** `now` 所在这一周的周一零点（本机时区）。按日历加减天数，不按 24 小时算，夏令时不错位。 */
export function mondayOf(now: Date): Date {
  const shift = (now.getDay() + 6) % 7
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - shift)
}

export function weeklyAccepted(
  entries: readonly CardEntry[],
  now: Date,
  weeks: number,
): Reading<readonly WeekCount[]> {
  const accepted = entries.filter(entry => entry.event === 'accepted').map(e => Date.parse(e.at))
  if (accepted.length === 0) return noData('台账里还没有接受过的卡')
  const monday = mondayOf(now)
  const out: WeekCount[] = []
  for (let back = weeks - 1; back >= 0; back -= 1) {
    const start = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7 * back)
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7)
    out.push({
      start: localDate(start),
      accepted: accepted.filter(time => time >= start.getTime() && time < end.getTime()).length,
    })
  }
  return data(out)
}

// ---- 各 topic 剩余卡数 ----

export interface TopicRemaining {
  readonly topic: string
  readonly total: number
  readonly accepted: number
  readonly remaining: number
  /** 剩余的卡里「就绪」写着「否」的。 */
  readonly notReady: number
}

export interface RemainingBlock {
  readonly topics: readonly TopicRemaining[]
  /** 台账里接受过、却不在任何 stories.md 里的卡。 */
  readonly unlisted: readonly string[]
}

export function remainingCards(
  topics:
    | readonly (Pick<TopicStories, 'topic'> & {
        readonly cards: readonly Pick<StoryCard, 'id' | 'ready'>[]
      })[]
    | undefined,
  entries: readonly CardEntry[],
  productRoot: string,
): Reading<RemainingBlock> {
  if (topics === undefined) return noData(`产品区 ${productRoot} 不存在`)
  if (topics.length === 0) return noData(`${productRoot} 下还没有哪个 topic 有 stories.md`)
  const accepted = new Set(entries.filter(e => e.event === 'accepted').map(e => e.card))
  const listed = new Set(topics.flatMap(topic => topic.cards.map(card => card.id)))
  return data({
    topics: topics.map(({ topic, cards }) => {
      const open = cards.filter(card => !accepted.has(card.id))
      return {
        topic,
        total: cards.length,
        accepted: cards.length - open.length,
        remaining: open.length,
        notReady: open.filter(card => card.ready === 'not-ready').length,
      }
    }),
    unlisted: [...accepted].filter(card => !listed.has(card)).sort(),
  })
}

// ---- 主线提交的大小 ----

export interface CommitSize {
  readonly sha: string
  readonly subject: string
  readonly files: number
}

export interface CommitsBlock {
  readonly branch: string
  readonly count: number
  readonly medianFiles: number
  readonly maxFiles: number
  /** 改的文件最多的三个，多到少。 */
  readonly largest: readonly CommitSize[]
}

/** `git log --format=%x00%H%x09%s --name-only` 的输出：每个提交的哈希、标题与改了几个文件。 */
export function parseCommitLog(text: string): CommitSize[] {
  return text
    .split('\u0000')
    .slice(1)
    .map(block => {
      const [head = '', ...paths] = block.split('\n')
      const tab = head.indexOf('\t')
      return {
        sha: tab < 0 ? head : head.slice(0, tab),
        subject: tab < 0 ? '' : head.slice(tab + 1),
        files: paths.filter(path => path !== '').length,
      }
    })
}

export function commitsBlock(
  commits: readonly CommitSize[],
  branch: string,
): Reading<CommitsBlock> {
  if (commits.length === 0) return noData(`${branch} 上没有提交`)
  const shape = shapeOf(commits.map(commit => commit.files))
  return data({
    branch,
    count: shape.commits,
    medianFiles: shape.medianFiles,
    maxFiles: shape.maxFiles,
    largest: [...commits].sort((a, b) => b.files - a.files).slice(0, 3),
  })
}

// ---- 全量测试的墙钟 ----

export interface TestRun {
  readonly startedAt: string
  readonly head: string
  readonly dirty: boolean
  /** 跑的是哪一层；早于分层的账本按 `all`。 */
  readonly tier: RunTier
  readonly wallSeconds: number
  readonly passed: boolean
}

/**
 * 一份 `ledger.json`（`src/testing/cli.ts` 写的）里这里要的部分；不是全量运行返回 `partial`。
 * 全量与受影响范围的区分：`run --all` 与 `--base` 二选一，全量运行的 `meta.base` 是 null。
 * 全量运行可以只跑一层（合并前的那一步就是全量快层），层记在 `meta.tier`。
 */
export function parseLedgerRun(
  value: unknown,
): { readonly kind: 'full'; readonly run: TestRun } | { readonly kind: 'partial' } | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { meta, members } = value as Record<string, unknown>
  if (typeof meta !== 'object' || meta === null || !Array.isArray(members)) return undefined
  const { base, startedAt, head, dirty, wallSeconds, tier } = meta as Record<string, unknown>
  if (
    typeof startedAt !== 'string' ||
    Number.isNaN(Date.parse(startedAt)) ||
    typeof head !== 'string' ||
    typeof dirty !== 'boolean' ||
    typeof wallSeconds !== 'number' ||
    base === undefined ||
    (tier !== undefined && !isRunTier(tier))
  )
    return undefined
  if (base !== null) return { kind: 'partial' }
  const exitCodes = members.map(member =>
    typeof member === 'object' && member !== null
      ? (member as Record<string, unknown>)['exitCode']
      : undefined,
  )
  if (!exitCodes.every(code => typeof code === 'number')) return undefined
  return {
    kind: 'full',
    run: {
      startedAt,
      head,
      dirty,
      tier: tier ?? 'all',
      wallSeconds,
      passed: exitCodes.every(code => code === 0),
    },
  }
}

export interface TestsBlock {
  /** 从旧到新。 */
  readonly runs: readonly TestRun[]
  /** 账本里受影响范围的运行数，不计入。 */
  readonly partial: number
  /** 读不了的账本（路径）。 */
  readonly unreadable: readonly string[]
}

export function testsBlock(
  ledgers: readonly { readonly path: string; readonly value: unknown }[] | undefined,
  runs: number,
  home: string,
): Reading<TestsBlock> {
  if (ledgers === undefined) return noData(`测试耗时账本目录 ${home} 不存在`)
  const full: TestRun[] = []
  const unreadable: string[] = []
  let partial = 0
  for (const ledger of ledgers) {
    const parsed = parseLedgerRun(ledger.value)
    if (parsed === undefined) unreadable.push(ledger.path)
    else if (parsed.kind === 'partial') partial += 1
    else full.push(parsed.run)
  }
  if (full.length === 0)
    return noData(
      `${home} 下 ${ledgers.length} 份账本里没有全量运行（受影响范围 ${partial} 份、读不了 ${unreadable.length} 份）`,
    )
  full.sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
  return data({ runs: full.slice(-runs), partial, unreadable })
}

// ---- 债的走向 ----

export interface Point {
  readonly commit: string
  readonly committedAt: string
  readonly value: number | null
  readonly band: Band | null
}

export interface Series {
  readonly id: string
  readonly points: readonly Point[]
  /** 配置里的三条线；没有绝对线为 null。 */
  readonly lines: Lines | null
}

export interface MemberSeries {
  readonly member: string
  /** 最新一条快照里这个成员的总带位；最新一条里没有它为 null。 */
  readonly latestBand: Band | null
  readonly items: readonly Series[]
}

export interface DebtBlock {
  readonly snapshots: number
  readonly indicators: readonly Series[]
  /** 当前或曾经处于处置的成员。 */
  readonly members: readonly MemberSeries[]
}

/** 同一提交多条取文件里最后一条，再按提交时间从旧到新。 */
export function orderedSnapshots(snapshots: readonly Snapshot[]): Snapshot[] {
  const latest = new Map<string, { snapshot: Snapshot; index: number }>()
  snapshots.forEach((snapshot, index) => latest.set(snapshot.commit, { snapshot, index }))
  return [...latest.values()]
    .sort(
      (a, b) =>
        Date.parse(a.snapshot.committedAt) - Date.parse(b.snapshot.committedAt) ||
        a.index - b.index,
    )
    .map(entry => entry.snapshot)
}

function indicatorIds(snapshots: readonly Snapshot[]): string[] {
  const ids: string[] = [...INDICATORS]
  for (const snapshot of snapshots)
    for (const id of Object.keys(snapshot.indicators)) if (!ids.includes(id)) ids.push(id)
  return ids
}

export function debtBlock(
  snapshots: readonly Snapshot[],
  config: Pick<LoopConfig, 'indicators' | 'memberBudget'>,
  trendPath: string,
): Reading<DebtBlock> {
  if (snapshots.length === 0)
    return noData(
      `趋势 ${trendPath} 里还没有快照（make loop-status SNAPSHOT=1 在干净的提交上写一条）`,
    )
  const ordered = orderedSnapshots(snapshots)
  const point = (snapshot: Snapshot, value: number | null, band: Band | null): Point => ({
    commit: snapshot.commit,
    committedAt: snapshot.committedAt,
    value,
    band,
  })
  const settings = new Map(Object.entries(config.indicators))
  const indicators = indicatorIds(ordered).map(id => ({
    id,
    lines: settings.get(id)?.lines ?? null,
    points: ordered.map(snapshot => {
      const found = snapshot.indicators[id]
      return point(snapshot, found?.value ?? null, found?.band ?? null)
    }),
  }))
  const acted = new Set<string>()
  for (const snapshot of ordered)
    for (const [member, values] of Object.entries(snapshot.members))
      if (values.band === 'act') acted.add(member)
  const latest = ordered.at(-1)
  const members = [...acted].sort().map(member => ({
    member,
    latestBand: latest?.members[member]?.band ?? null,
    items: BUDGET_ITEMS.map((item: BudgetItem) => ({
      id: item,
      lines: config.memberBudget[item],
      points: ordered.map(snapshot => {
        const found = snapshot.members[member]
        return point(snapshot, found?.[item] ?? null, null)
      }),
    })),
  }))
  return data({ snapshots: ordered.length, indicators, members })
}

// ---- 对照表条数 ----

export interface CatalogueBlock {
  readonly counts: Readonly<Record<Category, number>>
  readonly invalid: number
  /** 「现状」以「待建」开头的行。 */
  readonly pending: number
}

export function catalogueBlock(
  counted: Reading<{
    readonly counts: Readonly<Record<Category, number>>
    readonly invalid: readonly unknown[]
  }>,
  pending: number,
): Reading<CatalogueBlock> {
  if (counted.status === 'no-data') return counted
  return data({
    counts: Object.fromEntries(CATEGORIES.map(name => [name, counted.data.counts[name]])) as Record<
      Category,
      number
    >,
    invalid: counted.data.invalid.length,
    pending,
  })
}

// ---- 各传感器最近一次有数据 ----

export interface SensorLast {
  readonly id: string
  /** 从没有过数据为 null。 */
  readonly last: { readonly commit: string; readonly committedAt: string } | null
}

export function sensorsBlock(debt: Reading<DebtBlock>): Reading<readonly SensorLast[]> {
  if (debt.status === 'no-data') return debt
  return data(
    debt.data.indicators.map(series => {
      const last = series.points.filter(p => p.value !== null).at(-1)
      return {
        id: series.id,
        last: last === undefined ? null : { commit: last.commit, committedAt: last.committedAt },
      }
    }),
  )
}

// ---- 汇总 ----

export interface Health {
  readonly meta: {
    readonly head: string
    readonly shortHead: string
    readonly branch: string
    readonly dirty: boolean
    readonly generatedAt: string
    readonly home: string
    readonly windows: LoopConfig['health']
    /** 读台账、趋势时跳过的坏行，以及别的读数事实。 */
    readonly notes: readonly string[]
  }
  readonly cards: Reading<CardsBlock>
  readonly weekly: Reading<readonly WeekCount[]>
  readonly remaining: Reading<RemainingBlock>
  readonly commits: Reading<CommitsBlock>
  readonly tests: Reading<TestsBlock>
  readonly debt: Reading<DebtBlock>
  readonly catalogue: Reading<CatalogueBlock>
  readonly sensors: Reading<readonly SensorLast[]>
}
