import type { Interval } from '../score.ts'
import type { ExaminerKind } from './script.ts'
import {
  GATE,
  neededForGate,
  passesGate,
  type ExamScore,
  type Share,
  type Spread,
} from './score.ts'

export type ExamReport = Readonly<{
  name: string
  examiner: ExaminerKind
  definition: string
  products: number
  score: ExamScore
}>

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`
const span = (found: Interval, show: (value: number) => string): string =>
  `${show(found.low)} 到 ${show(found.high)}`
const of = (found: Share): string =>
  `${pct(found.rate)}（${String(found.errors)}/${String(found.n)}），95% 区间 ${span(found.interval, pct)}`
const spreadOf = (found: Spread, show: (value: number) => string): string =>
  `均值 ${show(found.mean)}（95% 区间 ${span(found.interval, show)}），中位 ${show(found.median)}，最大 ${show(found.max)}`
const usd = (value: number): string => `${value.toFixed(4)} 美元`
const seconds = (value: number): string => `${value.toFixed(0)} 秒`

function gateLine(found: Share): string {
  if (passesGate(found)) return '过了。'
  const over = found.interval.high - GATE.upper
  const point =
    found.rate > GATE.point
      ? `点估计 ${pct(found.rate)}，高出 ${pct(found.rate - GATE.point)}；`
      : ''
  return `没过：${point}95% 上界 ${pct(found.interval.high)}，高出 ${pct(over)}。没做到的判据要有 ${String(neededForGate())} 条全读对，上界才到得了 ${pct(GATE.upper)}；这一轮有 ${String(found.n)} 条。`
}

const listed = (items: readonly string[]): readonly string[] =>
  items.length === 0 ? ['没有。'] : items.map(item => `- \`${item}\``)

/** The page a person reads: the three numbers first, each with its interval, then the gate, then what the examiner did to the work and what it read wrong. */
export function renderExamReport(report: ExamReport): string {
  const { score } = report
  return [
    `# ${report.name}`,
    '',
    `查验的一方：\`${report.examiner}\`（${report.definition}）。数据：${String(report.products)} 份成品，${String(score.cases)} 个用例，${String(score.batches)} 批。`,
    '',
    '## 三样数',
    '',
    '| 指标 | 值 |',
    '| --- | --- |',
    `| 没做到的被答成成立 | ${of(score.falseHolds)} |`,
    `| 做到了却答没做到或判不了 | ${of(score.timid)}；其中答没做到 ${String(score.timidFails)} 条，判不了 ${String(score.timidCannotTell)} 条 |`,
    `| 每一批的花费 | ${spreadOf(score.usd, usd)}；这一轮合计 ${usd(score.totalUsd)} |`,
    `| 每一批的用时 | ${spreadOf(score.seconds, seconds)} |`,
    '',
    '## 门槛',
    '',
    `没做到的被答成成立：点估计不高于 ${pct(GATE.point)}，95% 上界不高于 ${pct(GATE.upper)}（与判定的误判成立率相同）。${gateLine(score.falseHolds)}`,
    '',
    '## 记着上一批时',
    '',
    `上一批之后变了的判据（改好的、改坏的）里，照上一次答的：${of(score.parroted)}。`,
    '',
    '## 它动了被查的活吗',
    '',
    '改了成品里的文件的：',
    ...listed(score.changedWork),
    '',
    '在成品的目录里多写了东西的：',
    ...listed(score.addedToWork),
    '',
    '## 没跑完的用例',
    '',
    ...listed(score.failed),
    '',
    '目标在前一批就收场、后面的步骤没查到的（前一批的读数照算）：',
    ...listed(score.cutShort),
    '',
    '## 读错的',
    '',
    '| 用例 | 第几批 | 这一批是 | 判据 | 是 | 答了 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...score.wrong.map(
      row =>
        `| \`${row.case}\` | ${String(row.step + 1)} | ${row.kind} | ${row.criterion} | ${row.truth} | ${row.said} |`,
    ),
    '',
  ].join('\n')
}
