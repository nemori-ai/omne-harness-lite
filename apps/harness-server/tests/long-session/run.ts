// The long-session measurement (line #1220, M1 to M4): one session of one tenant on the release
// assembly of `../history-cost/assembly.ts` (the release distribution, real SQLite storage, the
// release Shell, the local model gateway) gets `--rounds` inputs one after the other. Each round
// is one user input: the scripted model calls the release Shell once, gets a 4 KiB result back
// inline and answers with text, so a round is two model calls and one tool call. Per round the run
// records the six readings that `docs/engineering/perf-baseline.md` defines, then `judge.ts`
// judges them. The probes live in this directory and in the assembly; no member source changes.
//
//   node apps/harness-server/tests/long-session/run.ts --out <new directory> [--rounds 200]
//     [--control growth]
//
// Build the workspace first (`pnpm run build`). `--control growth` is the negative control: every
// round the Shell sleeps 2 ms longer, the process keeps 1 MiB more, and the data directory gets a
// file 16 KiB larger than the round before, so all three series grow. Writes `rounds.jsonl` (one
// line per round), `storage-<round>.json`, `visible-<round>.json` and `polling-<round>.json` every
// ten rounds, `run.json`, then `summary.json` and `summary.md` from `judge.ts`. Exits 0 when the
// run completed, whatever the gates say, and 1 when it failed: most gates have no line yet, so
// they are reported, not enforced.
//
// Counting: a round's phase lasts from its input until `SETTLE_MS` after its terminal, so the work
// that ends after the terminal (releases, settlements) counts in the round that caused it. The run
// learns that a round ended by reading the newest terminal entry through the entry every
// `POLL_MS`; each poll costs storage reads of its own. Every ten rounds, after the round settled,
// the run polls `CALIBRATION_POLLS` times in a phase of its own and keeps the reads per poll by
// handler; a round's reads are its counted reads minus its polls times that profile.
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { arch, cpus, freemem, loadavg, platform, release, totalmem } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { parseArgs } from 'node:util'
import {
  createHttpTransport,
  createSessionClient,
  parseTenantText,
  userTextMessage,
} from '@omne-harness/sdk'
import { startAssembly } from '../history-cost/assembly.ts'
import { PAYLOAD_FILE } from '../history-cost/payload.ts'
import { bodyOf, savedLoginProof, savedTenant } from '../r9/support.ts'
import { judge } from './judge.ts'
import { installWorkerCount, type PhaseCounts } from './worker-count.ts'

/** The kinds the release answers in `read-history`: the visible history. */
const VISIBLE_KINDS = ['message.user', 'message.assistant'] as const
const POLL_MS = 20
const ROUND_LIMIT_MS = 180_000
const SETTLE_MS = 500
const CALIBRATION_POLLS = 20
/** Phases outside the rounds: setup, the polls of a calibration, the snapshots. */
const SETUP = 0
const CALIBRATION = -1
const SNAPSHOT = -2
const BETWEEN = -3
const STEPS_PER_ROUND = 2

const { values: args } = parseArgs({
  options: {
    out: { type: 'string' },
    rounds: { type: 'string', default: '200' },
    control: { type: 'string' },
  },
})
if (args.out === undefined) throw new Error('give --out <new directory>')
const out = resolve(args.out)
if (existsSync(out) && readdirSync(out).length > 0) throw new Error(`${out} is not empty`)
mkdirSync(out, { recursive: true })
const rounds = Number(args.rounds)
if (!Number.isSafeInteger(rounds) || rounds < 1)
  throw new Error('--rounds must be a positive integer')
const control = args.control ?? null
if (control !== null && control !== 'growth') throw new Error('--control takes only growth')

type Segment = Readonly<{ owner: string; name: string; endMs: number; durationMs: number }>
type Entry = Readonly<{ kind?: string; payload?: { terminal?: { outcome?: string } } }>
type Page = Readonly<{ entries: Entry[]; next: string | null; exhausted: boolean }>

/** The telemetry records the server writes to its stdout writer: segment ends, counts of the rest. */
function createTelemetryTap() {
  const segments: Segment[] = []
  const counts = { records: 0, segments: 0, other: {} as Record<string, number> }
  const record = (value: unknown) => {
    if (typeof value !== 'object' || value === null) return
    if (Reflect.get(value, 'kind') !== 'telemetry') return
    counts.records += 1
    const signal = String(Reflect.get(value, 'signal'))
    if (signal !== 'segment-end') {
      const name = `${signal}:${String(Reflect.get(value, 'name'))}`
      counts.other[name] = (counts.other[name] ?? 0) + 1
      return
    }
    counts.segments += 1
    segments.push({
      owner: String(Reflect.get(value, 'owner')),
      name: String(Reflect.get(value, 'name')),
      endMs: Date.parse(String(Reflect.get(value, 'time'))),
      durationMs: Number(Reflect.get(value, 'durationMs')),
    })
  }
  /** The segments that ended in `[from, to]` (wall milliseconds): union by owner, totals by name. */
  const between = (from: number, to: number) => {
    const mine = segments.filter(item => item.endMs >= from && item.endMs <= to)
    const byOwner = new Map<string, (readonly [number, number])[]>()
    const byName: Record<string, { count: number; ms: number }> = {}
    for (const item of mine) {
      byOwner.set(item.owner, [
        ...(byOwner.get(item.owner) ?? []),
        [item.endMs - item.durationMs, item.endMs],
      ])
      const known = byName[item.name] ?? { count: 0, ms: 0 }
      byName[item.name] = { count: known.count + 1, ms: known.ms + item.durationMs }
    }
    const stages = Object.fromEntries([...byOwner].map(([owner, list]) => [owner, unionMs(list)]))
    return { stages, segments: byName }
  }
  return { record, between, counts }
}

/** The union of the intervals, in milliseconds. */
function unionMs(intervals: readonly (readonly [number, number])[]): number {
  let total = 0
  let end = -Infinity
  for (const [from, to] of [...intervals].sort((a, b) => a[0] - b[0])) {
    if (to <= end) continue
    total += to - Math.max(from, end)
    end = to
  }
  return total
}

/** The bytes of every file under `dir`. */
function treeBytes(dir: string): number {
  let total = 0
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const stat = statSync(path, { throwIfNoEntry: false })
    if (stat !== undefined) total += stat.isDirectory() ? treeBytes(path) : stat.size
  }
  return total
}

const reads = (counts: PhaseCounts): Record<string, number> =>
  Object.fromEntries(Object.entries(counts.messages).filter(([kind]) => kind.startsWith('read:')))

/** A round's reads by handler with its polls taken out at the calibrated reads per poll. */
function withoutPolls(
  counted: Record<string, number>,
  polls: number,
  perPoll: Record<string, number>,
) {
  const result: Record<string, number> = {}
  for (const [handler, value] of Object.entries(counted)) {
    const left = value - polls * (perPoll[handler] ?? 0)
    if (left > 0.5) result[handler] = Math.round(left)
  }
  return result
}

const count = installWorkerCount()
const tap = createTelemetryTap()
let round = 0
const retained: Buffer[] = []
const assembly = await startAssembly('inline', undefined, {
  historyKinds: [...VISIBLE_KINDS, 'run.terminal'],
  record: tap.record,
  ...(control === 'growth'
    ? { script: () => `sleep ${((round * 2) / 1000).toFixed(3)}; cat ${PAYLOAD_FILE}` }
    : {}),
})
const home = join(assembly.base, 'home')

async function readHistory(
  session: string,
  cursor: string | null,
  direction: 'forward' | 'backward',
  pageBytes: number,
): Promise<Page> {
  const response = await fetch(`${assembly.server}/session-public/1`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      protocolVersion: 'session-public/1',
      messageId: randomUUID(),
      operation: 'read-history',
      // A continued read names its cursor only; the cursor carries the direction and the page size.
      body:
        cursor === null
          ? { tenant: savedTenant(home), session, cursor, direction, pageBytes: String(pageBytes) }
          : { tenant: savedTenant(home), session, cursor },
      loginProof: savedLoginProof(home),
    }),
  })
  const text = await response.text()
  if (response.status !== 200)
    throw new Error(`read-history ${String(response.status)}: ${text.slice(0, 300)}`)
  return (JSON.parse(text) as { body: Page }).body
}

/** The newest terminal entry as text, or null before the first. */
async function newestTerminal(session: string): Promise<string | null> {
  const page = await readHistory(session, null, 'backward', 65_536)
  const terminal = page.entries.find(entry => entry.payload?.terminal !== undefined)
  return terminal === undefined ? null : JSON.stringify(terminal)
}

/** The JSON bytes of the visible history: every entry of the visible kinds, read page by page. */
async function visibleHistory(session: string) {
  let cursor: string | null = null
  let bytes = 0
  let entries = 0
  for (;;) {
    const page = await readHistory(session, cursor, 'forward', 262_144)
    for (const entry of page.entries)
      if ((VISIBLE_KINDS as readonly string[]).includes(String(entry.kind))) {
        bytes += Buffer.byteLength(JSON.stringify(entry), 'utf8')
        entries += 1
      }
    if (page.exhausted || page.next === null) return { bytes, entries }
    cursor = page.next
  }
}

const machine = {
  platform: platform(),
  release: release(),
  arch: arch(),
  cpu: cpus()[0]?.model ?? 'unknown',
  cores: cpus().length,
  memoryBytes: totalmem(),
  node: process.version,
  head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
}
const startedAt = new Date().toISOString()
let outcome: Readonly<{ ok: boolean; error?: string; stderr?: readonly string[] }> = { ok: false }

try {
  await assembly.ready()
  await assembly.enrol(home, 'long-session')
  const session = String(
    bodyOf(await assembly.cli(home, ['create-session', '--definition', 'coding']))['session'],
  )
  const client = createSessionClient({
    transport: createHttpTransport({ origin: assembly.server, location: 'session' }),
  })
  const tenant = parseTenantText(savedTenant(home))
  if (tenant === undefined) throw new Error('the saved tenant does not parse')

  /** After the round settled: the reads per poll by handler, then the storage and the history. */
  const calibrateAndSnapshot = async (at: number): Promise<Record<string, number>> => {
    count.setPhase(CALIBRATION - at * 1000)
    for (let poll = 0; poll < CALIBRATION_POLLS; poll += 1) await newestTerminal(session)
    const perPoll = Object.fromEntries(
      Object.entries(reads(count.phase(CALIBRATION - at * 1000))).map(([handler, value]) => [
        handler,
        value / CALIBRATION_POLLS,
      ]),
    )
    writeFileSync(join(out, `polling-${String(at)}.json`), `${JSON.stringify(perPoll)}\n`)
    count.setPhase(SNAPSHOT - at * 1000)
    assembly.storageSnapshot(join(out, `storage-${String(at)}.json`))
    const visible = await visibleHistory(session)
    writeFileSync(
      join(out, `visible-${String(at)}.json`),
      `${JSON.stringify({ round: at, ...visible, dataBytes: treeBytes(assembly.stateRoot) })}\n`,
    )
    return perPoll
  }

  /** One round from its input to the terminal entry it causes; the counts come later. */
  const runRound = async (before: string | null) => {
    assembly.model.start(false)
    const modelBefore = assembly.modelMs()
    const load1 = loadavg()[0] ?? 0
    count.setPhase(round)
    const wallStart = Date.now()
    const started = performance.now()
    const inputId = randomUUID()
    const sent = await client.submit({
      protocolVersion: 'session-public/1',
      messageId: randomUUID(),
      operation: 'send-input',
      proof: { kind: 'present', value: savedLoginProof(home) },
      body: {
        tenant,
        session,
        acceptId: randomUUID(),
        inputId,
        message: userTextMessage(`long session round ${String(round)}`, inputId),
      },
    } as Parameters<typeof client.submit>[0])
    if (sent.kind !== 'response' || sent.message.outcome !== 'succeeded')
      throw new Error(`send-input: ${JSON.stringify(sent).slice(0, 300)}`)
    const deadline = started + ROUND_LIMIT_MS
    let terminal = before
    let polls = 0
    while (terminal === before) {
      if (performance.now() > deadline) throw new Error(`round ${String(round)} did not end`)
      await sleep(POLL_MS)
      terminal = await newestTerminal(session)
      polls += 1
    }
    const endToEndMs = performance.now() - started
    const wallEnd = Date.now()
    const outcomeOf = (JSON.parse(terminal ?? '{}') as Entry).payload?.terminal?.outcome
    if (outcomeOf !== 'completed')
      throw new Error(`round ${String(round)} ended ${String(terminal).slice(0, 500)}`)
    const model = assembly.model.result()
    if (model.errors.length > 0 || !model.completed)
      throw new Error(`round ${String(round)}: ${JSON.stringify(model.errors)}`)
    const modelMs = assembly.modelMs() - modelBefore
    const memory = process.memoryUsage()
    return {
      terminal,
      row: {
        round,
        endToEndMs,
        modelMs,
        ownOverheadMs: endToEndMs - modelMs,
        modelRequests: model.requests,
        polls,
        ...tap.between(wallStart, wallEnd),
        memory: {
          rss: memory.rss,
          heapUsed: memory.heapUsed,
          heapTotal: memory.heapTotal,
          external: memory.external,
          arrayBuffers: memory.arrayBuffers,
        },
        dataBytes: treeBytes(assembly.stateRoot),
        load1,
        freeMemoryBytes: freemem(),
      },
    }
  }

  /** Writes the line of a round once its phase has closed, so its trailing work is in it. */
  const writeRound = (
    row: Readonly<{ round: number; polls: number }>,
    perPoll: Record<string, number>,
  ) => {
    const counts = count.phase(row.round)
    const readsByHandler = withoutPolls(reads(counts), row.polls, perPoll)
    const line = {
      ...row,
      commits: counts.commits,
      reads: Object.values(readsByHandler).reduce((sum, value) => sum + value, 0),
      readsCounted: counts.reads,
      queries: counts.queries,
      commitsByParticipant: counts.commitsByParticipant,
      readsByHandler,
      journalOwnBytes: counts.journalOwnBytes,
      journalOwnBytesByKind: counts.journalOwnBytesByKind,
    }
    appendFileSync(join(out, 'rounds.jsonl'), `${JSON.stringify(line)}\n`)
  }

  let perPoll = await calibrateAndSnapshot(0)
  count.setPhase(BETWEEN)
  let before = await newestTerminal(session)
  for (round = 1; round <= rounds; round += 1) {
    if (control === 'growth') {
      retained.push(Buffer.alloc(1 << 20, round % 251))
      writeFileSync(
        join(assembly.stateRoot, `control-${String(round)}.bin`),
        Buffer.alloc(round * 16_384, 1),
      )
    }
    const { terminal, row } = await runRound(before)
    before = terminal
    // The work a round leaves after its terminal (releases, settlements) still counts in it.
    await sleep(SETTLE_MS)
    if (round % 10 === 0 || round === rounds) perPoll = await calibrateAndSnapshot(round)
    count.setPhase(BETWEEN)
    writeRound(row, perPoll)
  }
  outcome = { ok: true }
} catch (error) {
  outcome = { ok: false, error: String(error), stderr: assembly.stderr.slice(-20) }
} finally {
  const exitCode = await assembly.close()
  count.uninstall()
  const ok = outcome.ok && exitCode === 0
  const run = {
    ...outcome,
    ok,
    exitCode,
    rounds,
    control,
    startedAt,
    endedAt: new Date().toISOString(),
    machine,
    setup: count.phase(SETUP),
    between: count.phase(BETWEEN),
    telemetry: tap.counts,
    method: {
      round:
        'one user input; the scripted model calls the release Shell once (4 KiB inline result) and answers with text',
      stepsPerRound: STEPS_PER_ROUND,
      pollMs: POLL_MS,
      settleMs: SETTLE_MS,
      calibrationPolls: CALIBRATION_POLLS,
    },
  }
  writeFileSync(join(out, 'run.json'), `${JSON.stringify(run, null, 2)}\n`)
  if (ok) judge(out)
  console.log(JSON.stringify({ ok, out, error: outcome.error }))
  process.exitCode = ok ? 0 : 1
}
