import type { JudgeConfig } from '@omne-harness/goal-contract'
import { FAMILIES, type Family } from './case.ts'
import { graded, pairs, settled } from './grade.ts'
import type { Outcome, Replayed } from './replay.ts'
import {
  abstained,
  calibration,
  discrimination,
  falseHolds,
  falseSettles,
  lossOf,
  missed,
  quantile,
  weightedLoss,
  type Bin,
  type Discrimination,
  type Graded,
  type Rate,
} from './score.ts'

export type Report = Readonly<{
  name: string
  config: JudgeConfig
  split: string
  parents: number
  cases: number
  gates: Readonly<{
    falseHolds: Rate & { upper: number }
    falseHoldsByFamily: Readonly<Partial<Record<Family, Rate>>>
    discrimination: Readonly<Partial<Record<Family, Discrimination>>>
    falseSettles: Rate
  }>
  ranking: Readonly<{
    loss: number
    missed: Rate
    abstained: Rate
    missedViolations: Rate
    rightRow: Rate
    unavailable: number
  }>
  calibration: Readonly<{ bins: readonly Bin[]; ece: number }>
  cost: Readonly<{
    sent: number
    hits: number
    requestsPerCase: number
    inputP50: number
    inputP95: number
    outputP50: number
    costPerCase: number
    costTotal: number
    msP50: number
    msP95: number
  }>
  wrong: readonly Readonly<
    Pick<Graded, 'case' | 'id' | 'truth' | 'said' | 'probability'> & { loss: number }
  >[]
  falseSettled: readonly string[]
}>

const share = (errors: number, n: number): Rate => ({ errors, n, rate: n === 0 ? 0 : errors / n })

function costOf(replayed: Replayed): Report['cost'] {
  const perCase = replayed.outcomes.map(outcome => {
    const replies = outcome.replies.flat().flatMap(reply => (reply === null ? [] : [reply]))
    const sum = (pick: (reply: (typeof replies)[number]) => number) =>
      replies.reduce((total, reply) => total + pick(reply), 0)
    return {
      requests: outcome.replies.flat().length,
      input: sum(reply => reply.usage.input),
      output: sum(reply => reply.usage.output),
      cost: sum(reply => reply.usage.cost),
      ms: Math.max(0, ...replies.map(reply => reply.ms)),
    }
  })
  const of = (pick: (entry: (typeof perCase)[number]) => number) => perCase.map(pick)
  const total = of(entry => entry.cost).reduce((a, b) => a + b, 0)
  const cases = Math.max(1, perCase.length)
  return {
    sent: replayed.sent,
    hits: replayed.hits,
    requestsPerCase: of(entry => entry.requests).reduce((a, b) => a + b, 0) / cases,
    inputP50: quantile(
      of(entry => entry.input),
      0.5,
    ),
    inputP95: quantile(
      of(entry => entry.input),
      0.95,
    ),
    outputP50: quantile(
      of(entry => entry.output),
      0.5,
    ),
    costPerCase: total / cases,
    costTotal: total,
    msP50: quantile(
      of(entry => entry.ms),
      0.5,
    ),
    msP95: quantile(
      of(entry => entry.ms),
      0.95,
    ),
  }
}

/** Every number of one run, from the outcomes alone: the same outcomes give the same report. */
export function reportOf(
  name: string,
  config: JudgeConfig,
  split: string,
  replayed: Replayed,
): Report {
  const { outcomes } = replayed
  const entries = outcomes.flatMap(graded)
  const byFamily = FAMILIES.flatMap(family => {
    const mine = entries.filter(entry => entry.family === family)
    const found = falseHolds(mine)
    return found.n === 0 ? [] : [[family, share(found.errors, found.n)] as const]
  })
  const rules = entries.filter(entry => entry.kind === 'rule' && entry.truth === 'broken')
  const points = entries.flatMap(entry =>
    entry.kind === 'criterion' && entry.asked && entry.probability !== null
      ? [{ probability: entry.probability, right: entry.truth === 'holds' }]
      : [],
  )
  const wrong = entries
    .map(entry => ({ entry, loss: lossOf(entry) }))
    .filter(({ loss }) => loss > 0)
    .toSorted((a, b) => b.loss - a.loss || a.entry.case.localeCompare(b.entry.case))
    .map(({ entry, loss }) => ({
      case: entry.case,
      id: entry.id,
      truth: entry.truth,
      said: entry.said,
      probability: entry.probability,
      loss,
    }))
  const rows = (outcome: Outcome) => outcome.verdict.row === outcome.case.expected.row
  const ends = outcomes.map(settled)
  return {
    name,
    config,
    split,
    parents: new Set(outcomes.map(outcome => outcome.case.parent)).size,
    cases: outcomes.length,
    gates: {
      falseHolds: falseHolds(entries),
      falseHoldsByFamily: Object.fromEntries(byFamily),
      discrimination: discrimination(pairs(outcomes)),
      falseSettles: falseSettles(ends),
    },
    ranking: {
      loss: weightedLoss(entries),
      missed: missed(entries),
      abstained: abstained(entries),
      missedViolations: share(rules.filter(entry => entry.said !== 'broken').length, rules.length),
      rightRow: share(outcomes.filter(rows).length, outcomes.length),
      unavailable: outcomes.filter(outcome => outcome.findings.judge === 'unavailable').length,
    },
    calibration: calibration(points),
    cost: costOf(replayed),
    wrong,
    falseSettled: outcomes
      .filter((_outcome, index) => !ends[index]!.expected && ends[index]!.got)
      .map(outcome => outcome.case.id),
  }
}

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`
const of = (found: Rate): string =>
  `${pct(found.rate)}（${String(found.errors)}/${String(found.n)}）`

/** The report as the page a person reads: the three gates first, then what ranks, then cost and the errors. */
export function renderReport(report: Report): string {
  const { gates, ranking, cost, config } = report
  const families = FAMILIES.filter(family => gates.discrimination[family] !== undefined)
  const lines = [
    `# ${report.name}`,
    '',
    `配置：切法 \`${config.split}\`，题目引 \`${config.instructions.criterion}\`、通用的话 ${String(config.instructions.rules.length)} 句，摘录 ${String(config.packaging.excerpt)} 取 \`${config.packaging.take}\`，说明 ${config.packaging.notes ? '给' : '不给'}，过时 \`${config.packaging.staleness}\`，活动记录 \`${config.packaging.activity}\`，标记 \`${config.packaging.flags}\`，型号 \`${config.model}\`，线 ${String(config.line)}，问 ${String(config.votes)} 次。`,
    `数据：\`${report.split}\` 这一份，${String(report.parents)} 个母本，${String(report.cases)} 个用例。`,
    '',
    '## 三道门槛',
    '',
    '| 指标 | 值 |',
    '| --- | --- |',
    `| 误判成立率 | ${of(gates.falseHolds)}，95% 上界 ${pct(gates.falseHolds.upper)} |`,
    `| 目标级的误收场率 | ${of(gates.falseSettles)} |`,
    ...families.map(family => {
      const found = gates.discrimination[family] as Discrimination
      return `| 成对的分辨力 · ${family} | ${found.value.toFixed(2)}（子例 ${pct(found.child)}，母本 ${pct(found.parent)}，${String(found.n)} 对） |`
    }),
    '',
    '## 排序用的',
    '',
    '| 指标 | 值 |',
    '| --- | --- |',
    `| 加权损失 | ${ranking.loss.toFixed(3)} |`,
    `| 漏放率 | ${of(ranking.missed)} |`,
    `| 过度弃权率 | ${of(ranking.abstained)} |`,
    `| 守则漏报率 | ${of(ranking.missedViolations)} |`,
    `| 裁决表的行对上的 | ${of(ranking.rightRow)} |`,
    `| 判定不可用的用例 | ${String(ranking.unavailable)} |`,
    `| 期望校准误差 | ${report.calibration.ece.toFixed(3)} |`,
    '',
    '## 代价',
    '',
    `每个用例 ${cost.requestsPerCase.toFixed(2)} 次请求；输入 token 中位 ${String(cost.inputP50)}、95 分位 ${String(cost.inputP95)}；输出中位 ${String(cost.outputP50)}；耗时中位 ${String(cost.msP50)} 毫秒、95 分位 ${String(cost.msP95)} 毫秒；每个用例 ${cost.costPerCase.toFixed(6)} 美元，这一轮合计 ${cost.costTotal.toFixed(4)} 美元。这次实际发出 ${String(cost.sent)} 次请求，命中缓存 ${String(cost.hits)} 次。`,
    '',
    '## 误收场的用例',
    '',
    ...(report.falseSettled.length === 0
      ? ['没有。']
      : report.falseSettled.map(id => `- \`${id}\``)),
    '',
    '## 读错的条目（损失从高到低）',
    '',
    '| 用例 | 编号 | 该答 | 答了 | 概率 | 损失 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...report.wrong.map(
      entry =>
        `| \`${entry.case}\` | ${entry.id} | ${entry.truth} | ${entry.said} | ${entry.probability === null ? '' : entry.probability.toFixed(2)} | ${String(entry.loss)} |`,
    ),
    '',
  ]
  return lines.join('\n')
}
