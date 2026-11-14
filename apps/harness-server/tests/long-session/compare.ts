import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Summary } from './judge.ts'

export const REPEAT_RANGES = {
  commitsMedian: 0.02,
  queriesMedian: 0.02,
  journalTotalBytes: 0.02,
  readsMedian: 0.2,
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

type Gates = Readonly<{ median: Gate; growth: Gate }>

function seriesGates(summary: Summary): Record<string, Gates> {
  return {
    overhead: summary.overhead.gates,
    rss: summary.memory.rss.gates,
    heapUsed: summary.memory.heapUsed.gates,
    diskNewBytes: summary.disk.gates,
    commits: summary.trend.commits,
    reads: summary.trend.reads,
  }
}

function verdict(gates: Gates): string {
  const states = [gates.median.state, gates.growth.state]
  if (states.includes('fail')) return 'grows'
  return states.includes('blocked') ? 'blocked' : 'steady'
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
  const leftSeries = seriesGates(a)
  const rightSeries = seriesGates(b)
  const gates = Object.keys(leftSeries).map(series => {
    const x = leftSeries[series] as Gates
    const y = rightSeries[series] as Gates
    return {
      gate: series,
      a: `${verdict(x)} (${x.median.state}/${x.growth.state})`,
      b: `${verdict(y)} (${y.median.state}/${y.growth.state})`,
      ok: verdict(x) === verdict(y),
    }
  })
  gates.push({
    gate: 'journal',
    a: a.journal.state,
    b: b.journal.state,
    ok: a.journal.state === b.journal.state,
  })
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
