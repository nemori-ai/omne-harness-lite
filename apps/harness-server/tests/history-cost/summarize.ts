// Summarizes one history-cost run: for every measured call, the Tool, host and other SQL counts of
// its phase, and per history size the calls' wall-clock median and p95. The Tool and host slopes
// are zero when every measured call after 200 settled calls ran the same counts as every measured
// call after 20.
//
// node tests/history-cost/summarize.ts <out>   (reads samples.json and sql-trace/, writes summary.json)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Group, Owner } from './sql-probe.ts'

const base = resolve(process.argv[2] ?? '.')
type Sample = Readonly<{
  ordinal: number
  settledBefore: number
  measured: boolean
  elapsedMs: number
}>
const samples = JSON.parse(readFileSync(join(base, 'samples.json'), 'utf8')) as Sample[]
const groups = readdirSync(join(base, 'sql-trace'))
  .filter(name => name.endsWith('.json'))
  .flatMap(name => JSON.parse(readFileSync(join(base, 'sql-trace', name), 'utf8')) as Group[])

type Cost = Omit<Group, 'phase' | 'owner'>
const costOf = (phase: number, owner: Owner): Cost =>
  groups
    .filter(group => group.phase === phase && group.owner === owner)
    .reduce(
      (sum, group) => ({
        statements: sum.statements + group.statements,
        rowsRead: sum.rowsRead + group.rowsRead,
        rowsWritten: sum.rowsWritten + group.rowsWritten,
        bytes: sum.bytes + group.bytes,
      }),
      { statements: 0, rowsRead: 0, rowsWritten: 0, bytes: 0 },
    )

const quantile = (values: readonly number[], q: number) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] ?? Number.NaN
}

const run = JSON.parse(readFileSync(join(base, 'result.json'), 'utf8')) as {
  histories: readonly number[]
  measured: number
}
const { histories } = run
const measured = samples.filter(sample => sample.measured)
/** The measured calls of the window that starts after `n` settled calls. */
const byHistory = (n: number) =>
  measured.filter(sample => sample.settledBefore >= n && sample.settledBefore < n + run.measured)
const calls = measured.map(sample => ({
  ordinal: sample.ordinal,
  settledBefore: sample.settledBefore,
  elapsedMs: Math.round(sample.elapsedMs),
  tool: costOf(sample.ordinal, 'tool'),
  host: costOf(sample.ordinal, 'host'),
  other: costOf(sample.ordinal, 'other'),
}))
const distinct = (owner: 'tool' | 'host', n: number) => [
  ...new Set(
    calls
      .filter(call => byHistory(n).some(s => s.ordinal === call.ordinal))
      .map(call => JSON.stringify(call[owner])),
  ),
]
const summary = {
  histories: Object.fromEntries(
    histories.map(n => {
      const elapsed = byHistory(n).map(sample => sample.elapsedMs)
      return [
        n,
        {
          calls: elapsed.length,
          medianMs: Math.round(quantile(elapsed, 0.5)),
          p95Ms: Math.round(quantile(elapsed, 0.95)),
          tool: distinct('tool', n).map(text => JSON.parse(text) as Cost),
          host: distinct('host', n).map(text => JSON.parse(text) as Cost),
        },
      ]
    }),
  ),
  calls,
}
writeFileSync(join(base, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
console.log(JSON.stringify(summary.histories, null, 2))
