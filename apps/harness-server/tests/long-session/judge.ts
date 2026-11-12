// Judges one long-session run directory (written by `run.ts`) and writes `summary.json` and
// `summary.md`. The definitions and the gates are those of `docs/engineering/perf-baseline.md`
// 「长会话」. The two gates on a per-round series come from `tools/e9/metrics.mjs`, so own overhead,
// memory and new disk bytes are judged with the constants of P1. A run shorter than 200 rounds
// reports its readings, and every gate is `blocked`.
//
//   node apps/harness-server/tests/long-session/judge.ts <run directory>
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
// @ts-expect-error -- tools/e9 is plain JavaScript without declarations.
import { evaluateSeries } from '../../../../tools/e9/metrics.mjs'

/** The linear bound of the own bytes of the session log (perf-baseline 「守卫与阈值」, R2-D294). */
export const LINEAR_OWN_BYTES = { j0Bytes: 64 * 1024, wBytesPerStep: 12 * 1024 } as const

type Row = Readonly<{
  round: number
  endToEndMs: number
  modelMs: number
  ownOverheadMs: number
  stages: Record<string, number>
  segments: Record<string, { count: number; ms: number }>
  memory: {
    rss: number
    heapUsed: number
    heapTotal: number
    external: number
    arrayBuffers: number
  }
  dataBytes: number
  commits: number
  reads: number
  queries: number
  commitsByParticipant: Record<string, number>
  readsByHandler: Record<string, number>
  journalOwnBytes: number
  journalOwnBytesByKind: Record<string, number>
}>

type Gate = Readonly<{ state: string; [key: string]: unknown }>
type Gates = Readonly<{ median: Gate; growth: Gate }>

const median = (values: readonly number[]): number => {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? Number.NaN)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)

function gates(values: readonly number[]): Gates {
  return evaluateSeries([...values]) as Gates
}

/** The three keys with the largest totals of `pick` over the rows. */
function top(rows: readonly Row[], pick: (row: Row) => Record<string, number>, n = 3) {
  const totals: Record<string, number> = {}
  for (const row of rows)
    for (const [key, value] of Object.entries(pick(row))) totals[key] = (totals[key] ?? 0) + value
  const all = sum(Object.values(totals))
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, value]) => ({ key, total: value, share: all === 0 ? 0 : value / all }))
}

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'))

export type Summary = ReturnType<typeof summarize>

/** Judges `dir` and writes `summary.json` and `summary.md` into it. */
export function judge(dir: string): Summary {
  const summary = summarize(dir)
  writeFileSync(join(dir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
  writeFileSync(join(dir, 'summary.md'), markdown(summary))
  return summary
}

function summarize(dir: string) {
  const rows = readFileSync(join(dir, 'rounds.jsonl'), 'utf8')
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => JSON.parse(line) as Row)
  const run = readJson(join(dir, 'run.json')) as {
    setup: { journalOwnBytes: number }
    between: { journalOwnBytes: number }
    method: { stepsPerRound: number }
    machine: unknown
    control: string | null
  }
  const n = rows.length
  const full = n === 200
  const at = (round: number) => rows.find(row => row.round === round)

  // 1. own overhead, with the telemetry stages.
  const stageNames = [...new Set(rows.flatMap(row => Object.keys(row.stages)))].sort()
  const overhead = {
    medianMs: median(rows.map(row => row.ownOverheadMs)),
    firstMs: rows[0]?.ownOverheadMs,
    lastMs: rows.at(-1)?.ownOverheadMs,
    gates: gates(rows.map(row => row.ownOverheadMs)),
    stages: Object.fromEntries(
      stageNames.map(stage => [
        stage,
        {
          medianMs: median(rows.map(row => row.stages[stage] ?? 0)),
          gates: gates(rows.map(row => row.stages[stage] ?? 0)),
        },
      ]),
    ),
    top: top(rows, row =>
      Object.fromEntries(Object.entries(row.segments).map(([k, v]) => [k, v.ms])),
    ),
  }

  // 2. own bytes of the session log against J0 + W × steps.
  const steps = n * run.method.stepsPerRound
  const journalTotal =
    run.setup.journalOwnBytes +
    run.between.journalOwnBytes +
    sum(rows.map(row => row.journalOwnBytes))
  const journalLimit = LINEAR_OWN_BYTES.j0Bytes + LINEAR_OWN_BYTES.wBytesPerStep * steps
  const journal = {
    totalBytes: journalTotal,
    steps,
    limitBytes: journalLimit,
    timesLimit: journalTotal / journalLimit,
    state: journalTotal <= journalLimit ? 'pass' : 'fail',
    perRoundMedianBytes: median(rows.map(row => row.journalOwnBytes)),
    top: top(rows, row => row.journalOwnBytesByKind),
  }

  // 3. memory.
  const memory = {
    rss: {
      first: rows[0]?.memory.rss,
      last: rows.at(-1)?.memory.rss,
      every10: rows.filter(row => row.round % 10 === 0).map(row => [row.round, row.memory.rss]),
      gates: gates(rows.map(row => row.memory.rss)),
    },
    heapUsed: {
      first: rows[0]?.memory.heapUsed,
      last: rows.at(-1)?.memory.heapUsed,
      every10: rows
        .filter(row => row.round % 10 === 0)
        .map(row => [row.round, row.memory.heapUsed]),
      gates: gates(rows.map(row => row.memory.heapUsed)),
    },
    top: top(rows.slice(-1), row => ({
      'heap (JS objects)': row.memory.heapUsed,
      'external (C++ objects bound to JS)': row.memory.external - row.memory.arrayBuffers,
      'array buffers': row.memory.arrayBuffers,
      'outside the V8 heap (rss − heapTotal − external)': Math.max(
        0,
        row.memory.rss - row.memory.heapTotal - row.memory.external,
      ),
    })),
  }

  // 4. disk.
  const snapshots = readdirSync(dir)
    .map(name => /^visible-(\d+)\.json$/u.exec(name)?.[1])
    .filter((value): value is string => value !== undefined)
    .map(Number)
    .sort((a, b) => a - b)
  const lastSnapshot = snapshots.at(-1) ?? 0
  const visible = snapshots.map(round => ({
    round,
    ...(readJson(join(dir, `visible-${String(round)}.json`)) as {
      bytes: number
      dataBytes: number
    }),
  }))
  const storage = existsSync(join(dir, `storage-${String(lastSnapshot)}.json`))
    ? (readJson(join(dir, `storage-${String(lastSnapshot)}.json`)) as {
        file: string
        bytes: number
        tableBytes: Record<string, number>
        tables: Record<string, number>
      }[])
    : []
  const startBytes = visible[0]?.dataBytes ?? 0
  const newBytes = rows.map(
    (row, index) => row.dataBytes - (index === 0 ? startBytes : (rows[index - 1]?.dataBytes ?? 0)),
  )
  const lastVisible = visible.at(-1)
  const disk = {
    dataBytes: rows.at(-1)?.dataBytes,
    visibleHistoryBytes: lastVisible?.bytes,
    timesVisible:
      lastVisible === undefined || lastVisible.bytes === 0
        ? null
        : lastVisible.dataBytes / lastVisible.bytes,
    newBytesPerRoundMedian: median(newBytes),
    gates: gates(newBytes),
    files: storage.map(file => ({ file: file.file, bytes: file.bytes })),
    top: top(
      [
        {
          tableBytes: Object.assign({}, ...storage.map(file => file.tableBytes)),
        } as unknown as Row,
      ],
      row => Reflect.get(row, 'tableBytes') as Record<string, number>,
    ),
    rowsAtEnd: Object.assign({}, ...storage.map(file => file.tables)) as Record<string, number>,
  }

  // 5. one tool call (one round has exactly one).
  const toolCall = {
    commitsMedian: median(rows.map(row => row.commits)),
    readsMedian: median(rows.map(row => row.reads)),
    queriesMedian: median(rows.map(row => row.queries)),
    endToEndMedianMs: median(rows.map(row => row.endToEndMs)),
    commitsByParticipantMedian: Object.fromEntries(
      [...new Set(rows.flatMap(row => Object.keys(row.commitsByParticipant)))]
        .sort()
        .map(key => [key, median(rows.map(row => row.commitsByParticipant[key] ?? 0))]),
    ),
    topCommits: top(rows, row => row.commitsByParticipant),
    topReads: top(rows, row => row.readsByHandler),
  }

  // 6. commits and reads against the round.
  const trend = {
    at: Object.fromEntries(
      [1, 20, 100, 200]
        .map(round => [round, at(round)] as const)
        .filter(([, row]) => row !== undefined)
        .map(([round, row]) => [round, { commits: row?.commits, reads: row?.reads }]),
    ),
    commits: gates(rows.map(row => row.commits)),
    reads: gates(rows.map(row => row.reads)),
  }

  return {
    dir,
    rounds: n,
    full,
    control: run.control,
    machine: run.machine,
    overhead,
    journal,
    memory,
    disk,
    toolCall,
    trend,
  }
}

const mib = (bytes: number | undefined) =>
  bytes === undefined ? '—' : `${(bytes / 1048576).toFixed(1)} MiB`
const ms = (value: number | undefined) => (value === undefined ? '—' : `${value.toFixed(0)} ms`)
const gateText = (gate: Gates) =>
  `窗口比值 ${gate.median.state}${typeof gate.median['ratio'] === 'number' ? `（${(gate.median['ratio'] as number).toFixed(2)}）` : ''}；逐段增长 ${gate.growth.state}${typeof gate.growth['r2'] === 'number' ? `（斜率 ${(gate.growth['slope'] as number).toPrecision(3)}，R² ${(gate.growth['r2'] as number).toFixed(2)}）` : ''}`
const topText = (items: readonly { key: string; share: number }[]) =>
  items.map(item => `${item.key}（${(item.share * 100).toFixed(0)}%）`).join('；')

function markdown(s: Summary): string {
  const lines = [
    `# 长会话读数：${String(s.rounds)} 轮${s.control === null ? '' : `（负控 ${String(s.control)}）`}`,
    '',
    `| 读数 | 值 | 判法 | 占得最多的三处 |`,
    `| --- | --- | --- | --- |`,
    `| 每轮自身开销 | 中位 ${ms(s.overhead.medianMs)}，第 1 轮 ${ms(s.overhead.firstMs)}，末轮 ${ms(s.overhead.lastMs)} | ${gateText(s.overhead.gates)} | ${topText(s.overhead.top)} |`,
    `| 日志累计自有字节 | ${mib(s.journal.totalBytes)}，界 ${mib(s.journal.limitBytes)}（${String(s.journal.steps)} 步），${s.journal.timesLimit.toFixed(1)} 倍 | ${s.journal.state} | ${topText(s.journal.top)} |`,
    `| 进程常驻内存 | ${mib(s.memory.rss.first)} → ${mib(s.memory.rss.last)} | ${gateText(s.memory.rss.gates)} | ${topText(s.memory.top)} |`,
    `| 进程堆 | ${mib(s.memory.heapUsed.first)} → ${mib(s.memory.heapUsed.last)} | ${gateText(s.memory.heapUsed.gates)} | |`,
    `| 磁盘 | 数据目录 ${mib(s.disk.dataBytes)}，可见历史 ${mib(s.disk.visibleHistoryBytes)}，${s.disk.timesVisible === null ? '—' : s.disk.timesVisible.toFixed(0)} 倍；每轮新增中位 ${(s.disk.newBytesPerRoundMedian / 1024).toFixed(1)} KiB | 每轮新增：${gateText(s.disk.gates)} | ${topText(s.disk.top)} |`,
    `| 一次工具调用 | 提交 ${String(s.toolCall.commitsMedian)}，读往返 ${String(s.toolCall.readsMedian)}，提交前查询 ${String(s.toolCall.queriesMedian)}，中位 ${ms(s.toolCall.endToEndMedianMs)} | 只报告 | 提交：${topText(s.toolCall.topCommits)}；读：${topText(s.toolCall.topReads)} |`,
    `| 每轮提交与读的走向 | ${Object.entries(s.trend.at)
      .map(([round, value]) => `第 ${round} 轮 ${String(value.commits)}／${String(value.reads)}`)
      .join('，')} | 提交：${gateText(s.trend.commits)}；读：${gateText(s.trend.reads)} | |`,
    '',
    '各段（遥测的段按拥有者求并集）：',
    '',
    ...Object.entries(s.overhead.stages).map(
      ([stage, value]) => `- ${stage}：中位 ${ms(value.medianMs)}；${gateText(value.gates)}`,
    ),
    '',
  ]
  return `${lines.join('\n')}\n`
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = process.argv[2]
  if (dir === undefined) throw new Error('give a run directory')
  judge(dir)
  console.log(readFileSync(join(dir, 'summary.md'), 'utf8'))
}
