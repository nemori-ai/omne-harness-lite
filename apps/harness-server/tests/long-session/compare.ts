// Compares two long-session runs of the same commit against the repeat ranges that
// `docs/engineering/perf-baseline.md` 「长会话」 states before any two runs were compared: counts
// within 2 %, reads within 5 %, window medians of own overhead within 25 % (the machine is shared),
// resident memory at the last round within 15 %, the data directory at the last round within 5 %,
// and the same state for every gate. Prints one line per reading; exits 0 when every reading is in
// range and 1 when one is not.
//
//   node apps/harness-server/tests/long-session/compare.ts <run a> <run b>
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Summary } from './judge.ts'

/** The relative ranges, by reading. */
export const REPEAT_RANGES = {
  commitsMedian: 0.02,
  queriesMedian: 0.02,
  journalTotalBytes: 0.02,
  readsMedian: 0.05,
  overheadEarlyMedian: 0.25,
  overheadLateMedian: 0.25,
  rssLast: 0.15,
  dataBytesLast: 0.05,
} as const

type Reading = keyof typeof REPEAT_RANGES

type Gate = Readonly<{ state: string; earlyMedian?: number; lateMedian?: number }>

function readings(summary: Summary): Record<Reading, number | undefined> {
  const median = summary.overhead.gates.median as Gate
  return {
    commitsMedian: summary.toolCall.commitsMedian,
    queriesMedian: summary.toolCall.queriesMedian,
    journalTotalBytes: summary.journal.totalBytes,
    readsMedian: summary.toolCall.readsMedian,
    overheadEarlyMedian: median.earlyMedian,
    overheadLateMedian: median.lateMedian,
    rssLast: summary.memory.rss.last,
    dataBytesLast: summary.disk.dataBytes,
  }
}

/** Every gate of a summary by its path, with its state. */
function gateStates(summary: Summary): Record<string, string> {
  const states: Record<string, string> = {}
  const add = (name: string, gates: Readonly<{ median: Gate; growth: Gate }>) => {
    states[`${name}.median`] = gates.median.state
    states[`${name}.growth`] = gates.growth.state
  }
  add('overhead', summary.overhead.gates)
  add('rss', summary.memory.rss.gates)
  add('heapUsed', summary.memory.heapUsed.gates)
  add('diskNewBytes', summary.disk.gates)
  add('commits', summary.trend.commits)
  add('reads', summary.trend.reads)
  states['journal'] = summary.journal.state
  return states
}

export function compare(a: Summary, b: Summary) {
  const left = readings(a)
  const right = readings(b)
  const lines = (Object.keys(REPEAT_RANGES) as Reading[]).map(reading => {
    const x = left[reading]
    const y = right[reading]
    const range = REPEAT_RANGES[reading]
    if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y))
      return { reading, a: x, b: y, difference: null, range, ok: false }
    const base = Math.max(Math.abs(x), Math.abs(y))
    const difference = base === 0 ? 0 : Math.abs(x - y) / base
    return { reading, a: x, b: y, difference, range, ok: difference <= range }
  })
  const leftGates = gateStates(a)
  const rightGates = gateStates(b)
  const gates = Object.keys(leftGates).map(gate => ({
    gate,
    a: leftGates[gate],
    b: rightGates[gate],
    ok: leftGates[gate] === rightGates[gate],
  }))
  return { lines, gates, ok: lines.every(line => line.ok) && gates.every(gate => gate.ok) }
}

const load = (dir: string) => JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')) as Summary

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [first, second] = process.argv.slice(2)
  if (first === undefined || second === undefined) throw new Error('give two run directories')
  const result = compare(load(first), load(second))
  for (const line of result.lines)
    console.log(
      `${line.ok ? 'ok ' : 'OUT'} ${line.reading}: ${String(line.a)} vs ${String(line.b)}, ` +
        `差 ${line.difference === null ? '—' : `${(line.difference * 100).toFixed(1)}%`}，范围 ${String(line.range * 100)}%`,
    )
  for (const gate of result.gates)
    console.log(
      `${gate.ok ? 'ok ' : 'OUT'} gate ${gate.gate}: ${String(gate.a)} vs ${String(gate.b)}`,
    )
  console.log(result.ok ? 'in range' : 'out of range')
  process.exitCode = result.ok ? 0 : 1
}
