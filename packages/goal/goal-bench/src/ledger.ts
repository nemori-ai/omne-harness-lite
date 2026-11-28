import { readFileSync } from 'node:fs'
import { z } from 'zod'
import type { Report } from './report.ts'

const text = z.string().min(1)
export const LedgerEntrySchema = z.strictObject({
  name: text,
  axis: text,
  changed: text,
  conclusion: text,
})
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>

export const loadLedger = (file: string): readonly LedgerEntry[] =>
  z.array(LedgerEntrySchema).parse(JSON.parse(readFileSync(file, 'utf8')))

const of = (found: Readonly<{ errors: number; n: number }>): string =>
  `${String(found.errors)}/${String(found.n)}`

function numbers(report: Report | undefined): readonly string[] {
  if (report === undefined) return ['—', '—', '—', '—', '—', '—', '—']
  const { gates, ranking, cost } = report
  return [
    report.split,
    of(gates.falseHolds),
    of(gates.falseSettles),
    of(ranking.missed),
    of(ranking.missedViolations),
    ranking.loss.toFixed(3),
    cost.costPerCase.toFixed(5),
  ]
}

/** The ledger as one table: what each experiment changed and what was concluded, beside the numbers of its own report. An experiment that was run and not written down is listed last, as not written down. */
export function renderLedger(
  entries: readonly LedgerEntry[],
  reports: ReadonlyMap<string, Report>,
): string {
  const written = new Set(entries.map(entry => entry.name))
  const unwritten = [...reports.keys()]
    .filter(name => !written.has(name))
    .toSorted()
    .map((name): LedgerEntry => ({ name, axis: '—', changed: '—', conclusion: '没有记' }))
  const row = (entry: LedgerEntry): string =>
    `| \`${entry.name}\` | ${entry.axis} | ${entry.changed} | ${numbers(reports.get(entry.name)).join(' | ')} | ${entry.conclusion} |`
  return [
    '| 实验 | 轴 | 改了什么 | 数据 | 误判成立 | 误收场 | 漏放 | 守则漏报 | 加权损失 | 每次判定（美元） | 结论 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...[...entries, ...unwritten].map(row),
    '',
  ].join('\n')
}
