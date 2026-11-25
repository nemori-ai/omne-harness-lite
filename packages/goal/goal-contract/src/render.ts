import type { Criterion, Exit, GoalBody, Metric, Reference, Standing } from './body.ts'

/** The version of the rendering: the same data under the same version is the same text, character for character. */
export const RENDER_VERSION = 1
export const BODY_MAX_CHARACTERS = 4000

/** Characters as a person counts them: Unicode code points, not UTF-16 units. */
export function characters(text: string): number {
  let count = 0
  for (const _point of text) count += 1
  return count
}

const EXIT_KINDS = { budget: '预算', 'good-enough': '够用', condition: '条件', person: '要人定' }
const UNITS = { rounds: '轮' }

function evidenceText(evidence: Criterion['evidence']): string {
  switch (evidence.kind) {
    case 'command':
      return `命令 \`${evidence.command}\``
    case 'file':
      return `文件 \`${evidence.path}\``
    case 'metric':
      return `指标 ${evidence.metric}`
    case 'person':
      return '人确认'
  }
}

function criterionLines(entry: Criterion): string[] {
  const lines = [`- [${entry.id}] ${entry.statement}`, `  - 证据: ${evidenceText(entry.evidence)}`]
  if (entry.pass !== null)
    lines.push(`  - 通过: ${entry.pass.kind === 'exit-zero' ? '退出码 0' : entry.pass.text}`)
  return lines
}

function metricLines(entry: Metric): string[] {
  const lines = [
    `- [${entry.id}] ${entry.statement}`,
    `  - 量法: 命令 \`${entry.measure.command}\` 取 \`${entry.measure.path}\``,
    `  - 方向: ${entry.direction === 'lower' ? '越低越好' : '越高越好'}`,
    `  - 目标: ${String(entry.target)}`,
  ]
  if (entry.floor !== null) lines.push(`  - 底线: ${String(entry.floor)}`)
  if (entry.baseline !== null)
    lines.push(`  - 基线: ${entry.baseline === 'measure-first' ? '先量' : String(entry.baseline)}`)
  return lines
}

const standingText = (standing: Standing): string =>
  standing.kind === 'floor' ? `${standing.id} 到底线` : standing.id

function exitLines(entry: Exit): string[] {
  const lines = [`- [${entry.id}] ${entry.statement}`, `  - 种类: ${EXIT_KINDS[entry.kind]}`]
  if (entry.limits.length > 0)
    lines.push(
      `  - 上限: ${entry.limits.map(limit => `${String(limit.amount)} ${UNITS[limit.unit]}`).join(', ')}`,
    )
  if (entry.by.length > 0) lines.push(`  - 凭: ${entry.by.map(standingText).join(', ')}`)
  lines.push(`  - 交: ${entry.deliver}`, `  - 算: ${entry.counts === 'success' ? '成功' : '失败'}`)
  return lines
}

function referenceLines(entry: Reference): string[] {
  const lines = [`- [${entry.id}] ${entry.statement}`, `  - 在: \`${entry.at}\``]
  if (entry.readWhen !== null) lines.push(`  - 读: ${entry.readWhen}`)
  return lines
}

/** The text a person and an agent read. It is rendered from the data and never parsed back. */
export function renderBody(body: GoalBody): string {
  const sections: [string, readonly string[]][] = [
    ['目的', [body.purpose]],
    ['达成', body.criteria.flatMap(criterionLines)],
    ['指标', body.metrics.flatMap(metricLines)],
    ['守则', body.rules.map(entry => `- [${entry.id}] ${entry.statement}`)],
    ['退出', body.exits.flatMap(exitLines)],
    ['依据', body.references.flatMap(referenceLines)],
    ['做法', body.method.map(step => `- ${step}`)],
  ]
  return sections
    .filter(([, lines]) => lines.length > 0)
    .map(([title, lines]) => `## ${title}\n${lines.join('\n')}\n`)
    .join('\n')
}
