// Summarizes and judges one history-cost run: for every measured call, the Tool, host and other
// SQL counts of its phase; per history size, the min, median and max of each count and the calls'
// wall-clock median and p95; per Tool or host statement, the most rows one execution returned; per
// statement of any owner, the tables its plan scans. Exits non-zero when a Tool or host statement,
// the rows written or a scanned table fail the ruling below.
//
// node tests/history-cost/summarize.ts <out>
// Reads samples.json, sql-trace/ and storage-<n>.json; writes summary.json.
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

type Cost = Omit<Group, 'phase' | 'owner' | 'sql' | 'maxRowsRead' | 'ms' | 'scans'>
const costOf = (phase: number, owner: Owner): Cost =>
  groups
    .filter(
      group =>
        group.phase === phase &&
        (owner === 'other' ? group.owner.startsWith('other') : group.owner === owner),
    )
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
type Metric = keyof Cost
const METRICS: readonly Metric[] = ['statements', 'rowsRead', 'rowsWritten', 'bytes']
const OWNERS = ['tool', 'host'] as const

/** Min, median and max of each metric of `owner` over the measured calls after `n` settled calls. */
function spread(owner: 'tool' | 'host' | 'other', n: number) {
  const window = calls.filter(call => byHistory(n).some(sample => sample.ordinal === call.ordinal))
  return Object.fromEntries(
    METRICS.map(metric => {
      const values = window.map(call => call[owner][metric])
      return [
        metric,
        { min: Math.min(...values), median: quantile(values, 0.5), max: Math.max(...values) },
      ]
    }),
  ) as Record<Metric, { min: number; median: number; max: number }>
}

// The owner's ruling on V7b: history growth shows as more rows from one execution of a
// statement, so for every Tool or host statement the most rows one execution returned must be the
// same after both history sizes, and every measured call must write the same rows. How often a
// statement runs follows wall time and the wait loops, so the counts and totals are reported only.
const [small, large] = histories
if (small === undefined || large === undefined) throw new Error('a run measures two histories')
const ordinalsOf = (n: number) => new Set(byHistory(n).map(sample => sample.ordinal))

/** The most rows one execution of each Tool or host statement returned in the window after `n`. */
function maxRowsByStatement(n: number): Map<string, number> {
  const ordinals = ordinalsOf(n)
  const most = new Map<string, number>()
  for (const group of groups)
    if ((group.owner === 'tool' || group.owner === 'host') && ordinals.has(group.phase)) {
      const name = `${group.owner} ${group.sql.replace(/\s+/gu, ' ')}`
      most.set(name, Math.max(most.get(name) ?? 0, group.maxRowsRead))
    }
  return most
}

/** The rows of each table over every database file, before the window that starts after `n`. */
function tableRows(n: number): Map<string, number> {
  const files = JSON.parse(readFileSync(join(base, `storage-${String(n)}.json`), 'utf8')) as {
    tables: Record<string, number>
  }[]
  const rows = new Map<string, number>()
  for (const file of files)
    for (const [table, count] of Object.entries(file.tables))
      rows.set(table, (rows.get(table) ?? 0) + count)
  return rows
}

// Rows returned do not show a statement that visits every row of a table to find a few. So no
// statement of a measured call, of any owner, may scan a table that the history made larger: a
// table whose rows grew between the two histories. A scan of a table of constant size passes.
const rowsSmall = tableRows(small)
const rowsLarge = tableRows(large)
const grew = (table: string) => (rowsLarge.get(table) ?? 0) > (rowsSmall.get(table) ?? 0)
const measuredPhases = new Set([...ordinalsOf(small), ...ordinalsOf(large)])
const scanning = new Map<string, Set<string>>()
for (const group of groups)
  if (measuredPhases.has(group.phase))
    for (const table of group.scans.filter(grew)) {
      const name = `${group.owner} ${group.sql.replace(/\s+/gu, ' ')}`
      scanning.set(name, (scanning.get(name) ?? new Set()).add(table))
    }

const before = maxRowsByStatement(small)
const after = maxRowsByStatement(large)
const verdicts = [
  ...(scanning.size === 0
    ? [{ rule: 'no scan of a table that grows', statement: 'every owner', holds: true, values: [] }]
    : [...scanning].sort().map(([statement, tables]) => ({
        rule: 'no scan of a table that grows',
        statement,
        holds: false,
        values: [...tables].map(
          table =>
            `${table} ${String(rowsSmall.get(table) ?? 0)}->${String(rowsLarge.get(table) ?? 0)}`,
        ),
      }))),
  ...[...new Set([...before.keys(), ...after.keys()])].sort().map(statement => ({
    rule: 'most rows per execution equal',
    statement,
    holds: before.get(statement) === after.get(statement),
    values: [before.get(statement) ?? null, after.get(statement) ?? null],
  })),
  ...OWNERS.map(owner => {
    const written = calls
      .filter(call => ordinalsOf(small).has(call.ordinal) || ordinalsOf(large).has(call.ordinal))
      .map(call => call[owner].rowsWritten)
    return {
      rule: 'rows written per call equal',
      statement: owner,
      holds: new Set(written).size === 1,
      values: [...new Set(written)],
    }
  }),
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
          tool: spread('tool', n),
          host: spread('host', n),
          other: spread('other', n),
        },
      ]
    }),
  ),
  verdicts,
  calls,
}
writeFileSync(join(base, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
for (const verdict of verdicts)
  console.log(
    `${verdict.holds ? 'PASS' : 'FAIL'} ${verdict.rule}: ${verdict.statement.slice(0, 120)}: ${verdict.values.join(' vs ')}`,
  )
for (const [n, window] of Object.entries(summary.histories))
  console.log(
    `after ${n}: ${String(window.calls)} calls, median ${String(window.medianMs)} ms, p95 ${String(window.p95Ms)} ms`,
  )
process.exitCode = verdicts.every(verdict => verdict.holds) ? 0 : 1
