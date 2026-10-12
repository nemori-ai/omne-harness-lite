// 债的走向、对照表条数、各传感器最近一次有数据。全是纯函数：读文件、跑 git 在 health-cli.ts，
// 「现在」由调用方注入。每一块要么有数据，要么写明没有数据的原因。
import { shapeOf } from '../metrics/git.ts'
import { isRunTier, type RunTier } from '../testing/config.ts'
import type { Band, Lines } from './bands.ts'
import { CATEGORIES, type Category } from './catalogue.ts'
import { BUDGET_ITEMS, INDICATORS, type BudgetItem, type LoopConfig } from './config.ts'
import { data, noData, type Reading } from './reading.ts'
import type { Snapshot } from './trend.ts'

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
 * 全量与受影响范围的区分：跑的是全部成员的运行（`run --all`，或计划判为全量的 `make check` 测试一步）`meta.base` 是 null，
 * 按影响面选成员的不是。全量运行可以只跑一层（`make check` 的测试一步快、慢两层各记一份），层记在 `meta.tier`。
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
  readonly conformance?: Reading<import('../arch/conformance-model.ts').Conformance>
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
  readonly commits: Reading<CommitsBlock>
  readonly tests: Reading<TestsBlock>
  readonly debt: Reading<DebtBlock>
  readonly catalogue: Reading<CatalogueBlock>
  readonly sensors: Reading<readonly SensorLast[]>
}
