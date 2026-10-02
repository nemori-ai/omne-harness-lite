// 流程体检页与它的文字摘要。页面自包含：样式取审讯页的同一套，走向图是内联 SVG，不带脚本，不引任何外部地址。
// 每一块要么有数据，要么写明「没有数据」与原因，不留空白、不画空图。纯函数。
import { escapeHtml, STYLE } from '../metrics/render.ts'
import { BAND_WORDS, type Band, type Lines } from './bands.ts'
import { BUDGET_LABELS } from './budget.ts'
import { CATEGORIES } from './catalogue.ts'
import type {
  CardsBlock,
  CatalogueBlock,
  CommitsBlock,
  DebtBlock,
  Health,
  RemainingBlock,
  SensorLast,
  Series,
  Span,
  TestsBlock,
  WeekCount,
} from './health.ts'
import { fixed } from './proposals.ts'
import type { Reading } from './reading.ts'
import { INDICATOR_LABELS } from './status.ts'

export const SECTION_TITLES = {
  cards: '卡',
  weekly: '每周接受数',
  remaining: '各 topic 剩余卡数',
  commits: '提交与合并的大小',
  tests: '测试耗时',
  debt: '债的走向',
  catalogue: '对照表条数',
  sensors: '传感器最近一次有数据',
} as const

const esc = (text: string) => escapeHtml(text).replaceAll('"', '&quot;')

export function formatHours(hours: number): string {
  return hours < 24 ? `${hours.toFixed(1)} 小时` : `${(hours / 24).toFixed(1)} 天`
}

export function spanText(span: Span): string {
  if (span.kind === 'done') return formatHours(span.hours)
  if (span.kind === 'open') return `进行中，已过 ${formatHours(span.elapsedHours)}`
  return '算不出：台账里没有 proposed'
}

const pad = (value: number) => String(value).padStart(2, '0')

/** 本机时区的 `YYYY-MM-DD HH:MM`。 */
export function localTime(iso: string): string {
  const date = new Date(iso)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const LABELS = new Map<string, string>([
  ...Object.entries(INDICATOR_LABELS),
  ...Object.entries(BUDGET_LABELS),
])
/** 趋势里有、本版已不认得的指标照原名显示。 */
const labelOf = (id: string) => LABELS.get(id) ?? id
const bandWord = (band: Band | null) => (band === null ? '不分带' : BAND_WORDS[band])
const empty = (reason: string) => `<div class="empty nodata">没有数据：${esc(reason)}</div>`

function section<T>(title: string, reading: Reading<T>, body: (value: T) => string): string {
  return `<h2>${esc(title)}</h2>\n${reading.status === 'no-data' ? empty(reading.reason) : body(reading.data)}\n`
}

function table(
  head: readonly string[],
  rows: readonly (readonly string[])[],
  numeric: readonly number[] = [],
): string {
  const cell = (tag: 'th' | 'td', index: number, html: string) =>
    `<${tag}${numeric.includes(index) ? ' class="num"' : ''}>${html}</${tag}>`
  return (
    `<table><thead><tr>${head.map((h, i) => cell('th', i, esc(h))).join('')}</tr></thead><tbody>` +
    rows.map(row => `<tr>${row.map((html, i) => cell('td', i, html)).join('')}</tr>`).join('') +
    '</tbody></table>'
  )
}

/**
 * 一条小折线：值为 null 的点断开；有线的画出提醒线（黄）与处置线（红）；最新一个有值的点画圆点。
 * 纵轴从 0 与最小值里较小的那个起，到最大值与线里最大的那个止。
 */
export function sparkline(values: readonly (number | null)[], lines: Lines | null): string {
  const width = 240
  const height = 48
  const margin = 5
  const present = values.filter((value): value is number => value !== null)
  if (present.length === 0) return ''
  const marks = lines === null ? [] : [lines.warn, lines.act]
  const low = Math.min(0, ...present)
  let high = Math.max(...present, ...marks)
  if (high === low) high = low + 1
  const x = (index: number) =>
    margin +
    (values.length === 1
      ? (width - 2 * margin) / 2
      : (index * (width - 2 * margin)) / (values.length - 1))
  const y = (value: number) =>
    height - margin - ((value - low) / (high - low)) * (height - 2 * margin)
  const runs: string[][] = []
  let run: string[] = []
  values.forEach((value, index) => {
    if (value === null) {
      if (run.length > 0) runs.push(run)
      run = []
    } else run.push(`${x(index).toFixed(1)},${y(value).toFixed(1)}`)
  })
  if (run.length > 0) runs.push(run)
  const parts = runs.map(points =>
    points.length === 1
      ? `<circle cx="${points[0]?.split(',')[0]}" cy="${points[0]?.split(',')[1]}" r="1.8" style="fill:var(--fg)"/>`
      : `<polyline points="${points.join(' ')}" style="fill:none;stroke:var(--fg);stroke-width:1.4"/>`,
  )
  if (lines !== null)
    for (const [mark, color] of [
      [lines.warn, 'var(--mid)'],
      [lines.act, 'var(--bad)'],
    ] as const)
      parts.unshift(
        `<line x1="${margin}" x2="${width - margin}" y1="${y(mark).toFixed(1)}" y2="${y(mark).toFixed(1)}" style="stroke:${color};stroke-dasharray:4 3;stroke-width:1"/>`,
      )
  const lastIndex = values.findLastIndex(value => value !== null)
  const last = values[lastIndex]
  if (last !== null && last !== undefined)
    parts.push(
      `<circle cx="${x(lastIndex).toFixed(1)}" cy="${y(last).toFixed(1)}" r="3" style="fill:var(--changed)"/>`,
    )
  return `<svg class="spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">${parts.join('')}</svg>`
}

function cardsHtml(block: CardsBlock): string {
  const lead =
    block.leadTime.status === 'no-data'
      ? `<div class="meta">前置时间：没有数据，${esc(block.leadTime.reason)}</div>`
      : `<div class="meta">接受过的 ${block.leadTime.data.count} 张卡，提出→接受的前置时间：中位数 ${formatHours(block.leadTime.data.medianHours)}，最长 ${formatHours(block.leadTime.data.maxHours)}</div>`
  const time = (iso: string | undefined) => (iso === undefined ? '—' : localTime(iso))
  return (
    lead +
    table(
      ['卡号', '标题', '提出', '第一次能跑', '接受', '提出→能跑', '提出→接受'],
      block.rows.map(row => [
        `<span class="mono">${esc(row.card)}</span>`,
        row.title === undefined
          ? '<span class="empty">不在任何 stories.md 里</span>'
          : `${esc(row.title)} <span class="meta mono">${esc(row.topic ?? '')}</span>`,
        time(row.proposed),
        time(row.runnable),
        time(row.accepted),
        esc(spanText(row.toRunnable)),
        esc(spanText(row.toAccepted)),
      ]),
    )
  )
}

function weeklyHtml(weeks: readonly WeekCount[]): string {
  const most = Math.max(1, ...weeks.map(week => week.accepted))
  return table(
    ['周一', '接受', ''],
    weeks.map(week => [
      week.start,
      String(week.accepted),
      `<span style="display:inline-block;height:10px;background:var(--good);width:${Math.round((week.accepted / most) * 160)}px"></span>`,
    ]),
    [1],
  )
}

function remainingHtml(block: RemainingBlock): string {
  const rows = block.topics.map(topic => [
    `<span class="mono">${esc(topic.topic)}</span>`,
    String(topic.total),
    String(topic.accepted),
    String(topic.remaining),
    String(topic.notReady),
  ])
  const unlisted =
    block.unlisted.length === 0
      ? ''
      : `<div class="meta">台账里接受过、却不在任何 stories.md 里的卡：${esc(block.unlisted.join('、'))}</div>`
  return table(['topic', '卡', '已接受', '剩余', '剩余里未就绪'], rows, [1, 2, 3, 4]) + unlisted
}

function commitsHtml(block: CommitsBlock): string {
  return (
    `<div class="meta">${esc(block.branch)} 最近 ${block.count} 个提交（沿第一父链，合并提交按它对第一父的改动计）：改动文件数中位数 ${block.medianFiles}，最大 ${block.maxFiles}</div>` +
    table(
      ['提交', '标题', '文件数'],
      block.largest.map(commit => [
        `<span class="mono">${esc(commit.sha.slice(0, 9))}</span>`,
        esc(commit.subject),
        String(commit.files),
      ]),
      [2],
    )
  )
}

function testsHtml(block: TestsBlock): string {
  const skipped = [
    block.partial === 0 ? '' : `受影响范围的运行 ${block.partial} 次不计`,
    block.unreadable.length === 0
      ? ''
      : `读不了的账本 ${block.unreadable.length} 份：${block.unreadable.join('、')}`,
  ].filter(text => text !== '')
  return (
    `<div class="meta">最近 ${block.runs.length} 次全量运行的墙钟（秒）${skipped.length === 0 ? '' : `；${esc(skipped.join('；'))}`}</div>` +
    sparkline(
      block.runs.map(run => run.wallSeconds),
      null,
    ) +
    table(
      ['开始', '提交', '秒', '结果'],
      block.runs.map(run => [
        localTime(run.startedAt),
        `<span class="mono">${esc(run.head.slice(0, 9))}${run.dirty ? '（不干净）' : ''}</span>`,
        String(run.wallSeconds),
        run.passed ? '全过' : '<span class="bad">有失败</span>',
      ]),
      [2],
    )
  )
}

function seriesRow(series: Series, latestBand: Band | null | undefined): string[] {
  const values = series.points.map(point => point.value)
  const latest = series.points.at(-1)
  const graph = sparkline(values, series.lines)
  return [
    esc(labelOf(series.id)),
    graph === '' ? '<span class="empty">从没有过数据</span>' : graph,
    latest === undefined || latest.value === null ? '最新一条没有数据' : fixed(latest.value),
    latestBand === undefined ? bandWord(latest?.band ?? null) : bandWord(latestBand),
    series.lines === null
      ? '没有绝对线'
      : `提醒 ${fixed(series.lines.warn)}／处置 ${fixed(series.lines.act)}／解除 ${fixed(series.lines.release)}`,
  ]
}

function debtHtml(block: DebtBlock): string {
  const head = [
    '指标',
    '走向（虚线：黄＝提醒线，红＝处置线；蓝点＝最新）',
    '最新值',
    '最新带位',
    '线',
  ]
  const members =
    block.members.length === 0
      ? '<div class="empty">没有当前或曾经处于处置的成员。</div>'
      : block.members
          .map(
            member =>
              `<h3 class="mono">${esc(member.member)}（最新总带位：${member.latestBand === null ? '最新快照里没有它' : BAND_WORDS[member.latestBand]}）</h3>` +
              table(
                ['预算项', '走向', '最新值', '', '线'],
                member.items.map(item =>
                  seriesRow(item, null).map((cell, i) => (i === 3 ? '' : cell)),
                ),
              ),
          )
          .join('')
  return (
    `<div class="meta">${block.snapshots} 条快照，按提交时间从旧到新</div>` +
    table(
      head,
      block.indicators.map(series => seriesRow(series, undefined)),
    ) +
    '<h3>超预算的成员（当前或曾经处于处置）</h3>' +
    members
  )
}

function catalogueHtml(block: CatalogueBlock): string {
  return table(
    [...CATEGORIES, '不合约定的行', '待建'],
    [
      [
        ...CATEGORIES.map(name => String(block.counts[name])),
        String(block.invalid),
        String(block.pending),
      ],
    ],
    CATEGORIES.map((_, index) => index).concat([CATEGORIES.length, CATEGORIES.length + 1]),
  )
}

function sensorsHtml(sensors: readonly SensorLast[]): string {
  return table(
    ['指标', '最近一条带着它的值的快照'],
    sensors.map(sensor => [
      esc(labelOf(sensor.id)),
      sensor.last === null
        ? '<span class="bad">从没有过数据</span>'
        : `<span class="mono">${esc(sensor.last.commit.slice(0, 9))}</span> · ${localTime(sensor.last.committedAt)}`,
    ]),
  )
}

const EXTRA_STYLE = `
.spark { display:block; } h3 { font-size:13.5px; margin:14px 0 6px; }
.nodata { border:1px dashed var(--line); border-radius:6px; padding:8px 10px; }
`

/** 自包含、离线可开的体检页。 */
export function renderHealthPage(health: Health): string {
  const { meta } = health
  const notes =
    meta.notes.length === 0
      ? ''
      : `<ul class="plain meta">${meta.notes.map(note => `<li>${esc(note)}</li>`).join('')}</ul>`
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>流程体检 ${esc(meta.shortHead)}</title>
<style>${STYLE}${EXTRA_STYLE}</style>
</head>
<body>
<h1>流程体检 <span class="mono">${esc(meta.shortHead)}</span>${meta.dirty ? '<span class="badge bad">工作树不干净</span>' : ''}</h1>
<div class="meta">生成于 ${esc(meta.generatedAt)} · 提交 <span class="mono">${esc(meta.head)}</span> · 分支 <span class="mono">${esc(meta.branch)}</span> · 回路目录 <span class="mono">${esc(meta.home)}</span></div>
<div class="meta">窗口：每周接受数看最近 ${meta.windows.weeks} 周 · 提交看最近 ${meta.windows.commits} 个 · 测试看最近 ${meta.windows.runs} 次全量运行</div>
${notes}
${section(SECTION_TITLES.cards, health.cards, cardsHtml)}
${section(SECTION_TITLES.weekly, health.weekly, weeklyHtml)}
${section(SECTION_TITLES.remaining, health.remaining, remainingHtml)}
${section(SECTION_TITLES.commits, health.commits, commitsHtml)}
${section(SECTION_TITLES.tests, health.tests, testsHtml)}
${section(SECTION_TITLES.debt, health.debt, debtHtml)}
${section(SECTION_TITLES.catalogue, health.catalogue, catalogueHtml)}
${section(SECTION_TITLES.sensors, health.sensors, sensorsHtml)}
</body>
</html>
`
}

/** 十来行的文字摘要，末行是页面路径。不超过 15 行。 */
export function healthSummary(health: Health, pagePath: string): string[] {
  const line = <T>(title: string, reading: Reading<T>, text: (value: T) => string) =>
    `${title}：${reading.status === 'no-data' ? `没有数据，${reading.reason}` : text(reading.data)}`
  const { meta } = health
  return [
    `流程体检 ${meta.shortHead}${meta.dirty ? '（工作树不干净）' : ''} · 分支 ${meta.branch} · 生成于 ${meta.generatedAt}`,
    ...meta.notes.slice(0, 2),
    line(SECTION_TITLES.cards, health.cards, block => {
      const open = block.rows.filter(row => row.toAccepted.kind !== 'done').length
      const lead =
        block.leadTime.status === 'no-data'
          ? '前置时间没有数据'
          : `前置时间中位数 ${formatHours(block.leadTime.data.medianHours)}、最长 ${formatHours(block.leadTime.data.maxHours)}`
      return `${block.rows.length} 张，已接受 ${block.rows.length - open}，未走完 ${open}；${lead}`
    }),
    line(SECTION_TITLES.weekly, health.weekly, weeks =>
      weeks.map(week => `${week.start.slice(5)} ${week.accepted}`).join('，'),
    ),
    line(SECTION_TITLES.remaining, health.remaining, block => {
      const sum = (key: 'total' | 'remaining' | 'notReady') =>
        block.topics.reduce((total, topic) => total + topic[key], 0)
      return `${block.topics.length} 个 topic，共 ${sum('total')} 张，剩余 ${sum('remaining')}（其中未就绪 ${sum('notReady')}）`
    }),
    line(SECTION_TITLES.commits, health.commits, block => {
      const top = block.largest[0]
      return `${block.branch} 最近 ${block.count} 个，文件数中位数 ${block.medianFiles}、最大 ${block.maxFiles}${top === undefined ? '' : `（${top.sha.slice(0, 9)} ${top.subject}）`}`
    }),
    line(SECTION_TITLES.tests, health.tests, block => {
      const last = block.runs.at(-1)
      return (
        `最近 ${block.runs.length} 次全量：${block.runs.map(run => run.wallSeconds).join('、')} 秒` +
        (last === undefined ? '' : `；最近一次${last.passed ? '全过' : '有失败'}`)
      )
    }),
    line(SECTION_TITLES.debt, health.debt, block => {
      const banded = block.indicators.filter(series => {
        const band = series.points.at(-1)?.band
        return band === 'warn' || band === 'act'
      })
      return (
        `${block.snapshots} 条快照；最新一条里在提醒或处置的指标 ${banded.length} 项` +
        (banded.length === 0 ? '' : `（${banded.map(series => labelOf(series.id)).join('、')}）`) +
        `；当前或曾经处置的成员 ${block.members.length} 个`
      )
    }),
    line(
      SECTION_TITLES.catalogue,
      health.catalogue,
      block =>
        `${CATEGORIES.map(name => `${name} ${block.counts[name]}`).join('、')}；待建 ${block.pending}` +
        (block.invalid === 0 ? '' : `；不合约定 ${block.invalid} 行`),
    ),
    line(SECTION_TITLES.sensors, health.sensors, sensors => {
      const never = sensors.filter(sensor => sensor.last === null)
      return never.length === 0
        ? '每个指标都有过数据'
        : `从没有过数据的 ${never.length} 项：${never.map(sensor => labelOf(sensor.id)).join('、')}`
    }),
    `页面：${pagePath}`,
  ]
}
