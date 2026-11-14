import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { createEnvironment, type Environment, type Launch } from '../support/matrix/environment.ts'
import { createProtocolDriver, type ProtocolDriver } from '../support/matrix/protocol-driver.ts'
import { startProviderStub, type ProviderStub } from '../support/matrix/provider-stub.ts'
import { readSessionLog, type SessionLog } from '../support/matrix/session-log.ts'
import { sleep, TURN_MS } from './cell.ts'

const PRELOAD = new URL('../support/matrix/commit-cut.mjs', import.meta.url).href
const EXPECTED_PATH = fileURLToPath(new URL('./crash-points.expected.json', import.meta.url))
const REPLY = 'crash-reply'
const INPUT = 'crash one'
const SCRIPTED_REPLIES = 10
const RECOVERY_MS = 20_000
const POLL_MS = 250
const SECOND_RUN_GRACE_MS = 2_000
const QUIET_MS = 3_000
const SESSION_QUIET_MS = 1_500
const CUT_EXIT_MS = 5_000
const PARALLEL = 2

type Red = 'diverged' | 'no-outcome'
type Result = 'equivalent' | Red | 'error'
type Recorded = Readonly<Record<string, number>>
type Listed = Readonly<{ cut: string; result: Red; detail: string }>
type Expected = Readonly<{ recorded: Recorded; red: readonly Listed[] }>
type Row = Readonly<{ cut: string; result: Result; detail: string; tookMs: number }>

type Rig = Readonly<{
  stub: ProviderStub
  env: Environment
  counts: string
  marker: string
  launch(cut?: string): Launch
}>

async function rig(): Promise<Rig> {
  const stub = await startProviderStub()
  for (let index = 0; index < SCRIPTED_REPLIES; index += 1) stub.push({ kind: 'reply', text: REPLY })
  const env = await createEnvironment({ modelUrl: stub.url, certPath: stub.certPath })
  const counts = join(env.base, 'cut', 'counts')
  const marker = join(env.base, 'cut', 'marker')
  mkdirSync(counts, { recursive: true })
  return {
    stub,
    env,
    counts,
    marker,
    launch: cut => ({
      nodeArgs: ['--import', PRELOAD],
      env: {
        CRASH_CUT_MARKER: marker,
        CRASH_CUT_COUNTS: counts,
        CRASH_CUT_STATE: env.stateDir,
        ...(cut === undefined ? {} : { CRASH_CUT_AT: cut }),
      },
    }),
  }
}

async function release(made: Rig, drivers: readonly ProtocolDriver[]): Promise<void> {
  for (const driver of drivers) driver.close()
  await made.env.dispose()
  await made.stub.close()
}

async function prepare(made: Rig): Promise<{ driver: ProtocolDriver; session: string }> {
  const driver = createProtocolDriver(made.env.origin)
  const registered = await driver.register()
  if (registered !== 'succeeded') throw new Error(`register answered ${registered}`)
  const session = await driver.createSession()
  let seen = -1
  let stableSince = Date.now()
  while (Date.now() - stableSince < SESSION_QUIET_MS) {
    const now = readSessionLog(made.env.domainsDir, session)?.entries.length ?? 0
    if (now !== seen) {
      seen = now
      stableSince = Date.now()
    }
    await sleep(POLL_MS)
  }
  writeFileSync(made.marker, '')
  return { driver, session }
}

function claimed(counts: string): string[] {
  return readdirSync(counts)
}

function cutOf(file: string): string {
  const at = file.lastIndexOf('-')
  return `${file.slice(0, at)}:${file.slice(at + 1)}`
}

function splitCut(cut: string): [string, number] {
  const at = cut.lastIndexOf(':')
  return [cut.slice(0, at), Number(cut.slice(at + 1))]
}

function byCut(left: string, right: string): number {
  const [leftKind, leftOrdinal] = splitCut(left)
  const [rightKind, rightOrdinal] = splitCut(right)
  return leftKind === rightKind ? leftOrdinal - rightOrdinal : leftKind < rightKind ? -1 : 1
}

function cutsOf(recorded: Recorded): string[] {
  return Object.entries(recorded)
    .flatMap(([kind, total]) =>
      Array.from({ length: total }, (_, index) => `${kind}:${String(index + 1)}`),
    )
    .sort(byCut)
}

async function waitFor<T>(
  probe: () => T | undefined,
  timeoutMs: number,
): Promise<T | undefined> {
  const until = Date.now() + timeoutMs
  for (;;) {
    const found = probe()
    if (found !== undefined) return found
    if (Date.now() > until) return undefined
    await sleep(POLL_MS)
  }
}

const settled = (log: SessionLog | null) =>
  log !== null && log.terminals.length > 0 && log.started === log.terminals.length

async function record(print: (line: string) => void): Promise<{
  recorded: Recorded
  threads: string[]
}> {
  const made = await rig()
  const drivers: ProtocolDriver[] = []
  try {
    await made.env.start([], made.launch())
    const { driver, session } = await prepare(made)
    drivers.push(driver)
    const sent = await driver.send(session, INPUT)
    if (sent !== 'succeeded') throw new Error(`send answered ${sent}`)
    const ended = await waitFor(() => {
      const log = readSessionLog(made.env.domainsDir, session)
      return settled(log) ? log : undefined
    }, TURN_MS)
    if (ended === undefined) throw new Error('the recorded run did not settle')
    if (ended.terminals[0] !== 'completed' || ended.assistants[0] !== REPLY)
      throw new Error(`the recorded run is not a plain reply: ${JSON.stringify(ended.kinds)}`)
    let seen = -1
    let stableSince = Date.now()
    while (Date.now() - stableSince < QUIET_MS) {
      const now = claimed(made.counts).length
      if (now !== seen) {
        seen = now
        stableSince = Date.now()
      }
      await sleep(POLL_MS)
    }
    const recorded: Record<string, number> = {}
    const threads = new Set<string>()
    const entries = new Map<string, string>()
    for (const file of claimed(made.counts)) {
      const cut = cutOf(file)
      const [kind, ordinal] = splitCut(cut)
      recorded[kind] = Math.max(recorded[kind] ?? 0, ordinal)
      const [thread = '', count = ''] = readFileSync(join(made.counts, file), 'utf8').split(' ')
      threads.add(thread)
      entries.set(cut, count)
    }
    print(`recorded: ${JSON.stringify(recorded)}; threads ${[...threads].join(',')}`)
    print(
      `session log entries after each commit: ${cutsOf(recorded)
        .map(cut => entries.get(cut))
        .join(',')}`,
    )
    return { recorded, threads: [...threads] }
  } finally {
    await release(made, drivers)
  }
}

function judge(log: SessionLog | null): { result: Result; detail: string } {
  if (log === null || !settled(log))
    return {
      result: 'no-outcome',
      detail:
        log === null
          ? 'no session log'
          : `no terminal within ${String(RECOVERY_MS)} ms; ${String(log.users.length)} user messages, ${String(log.started)} runs started, ${String(log.assistants.length)} assistant messages, last entry ${String(log.kinds.at(-1))}`,
    }
  const differences = [
    log.terminals[0] === 'completed' ? '' : `terminal ${String(log.terminals[0])}`,
    log.users.length === 1 ? '' : `${String(log.users.length)} user messages`,
    log.assistants.length === 1 && log.assistants[0] === REPLY
      ? ''
      : `assistant messages ${JSON.stringify(log.assistants)}`,
    log.started === 1 ? '' : `${String(log.started)} runs started`,
  ].filter(text => text !== '')
  return differences.length === 0
    ? { result: 'equivalent', detail: 'one completed run, one user and one assistant message' }
    : { result: 'diverged', detail: differences.join('; ') }
}

async function crash(cut: string): Promise<Row> {
  const began = Date.now()
  const made = await rig()
  const drivers: ProtocolDriver[] = []
  const row = (result: Result, detail: string): Row => ({
    cut,
    result,
    detail,
    tookMs: Date.now() - began,
  })
  try {
    await made.env.start([], made.launch(cut))
    const { driver, session } = await prepare(made)
    drivers.push(driver)
    let answered = 'no answer'
    void driver.send(session, INPUT).then(
      outcome => (answered = outcome),
      () => (answered = 'connection error'),
    )
    const [kind, ordinal] = splitCut(cut)
    const reached = await waitFor(
      () => (existsSync(join(made.counts, `${kind}-${String(ordinal)}`)) ? true : undefined),
      TURN_MS,
    )
    if (reached === undefined) return row('error', 'the cut point was never reached')
    const gone = await waitFor(() => (made.env.running() ? undefined : true), CUT_EXIT_MS)
    if (gone === undefined) return row('error', 'the server was still alive at the cut point')
    await made.env.start()
    const ended = await waitFor(() => {
      const log = readSessionLog(made.env.domainsDir, session)
      return settled(log) ? log : undefined
    }, RECOVERY_MS)
    if (ended !== undefined) await sleep(SECOND_RUN_GRACE_MS)
    const judged = judge(readSessionLog(made.env.domainsDir, session))
    return row(judged.result, `${judged.detail}; send answered ${answered}`)
  } catch (error: unknown) {
    return row('error', String(error instanceof Error ? error.message : error).slice(0, 300))
  } finally {
    await release(made, drivers)
  }
}

async function pool(cuts: readonly string[], print: (line: string) => void): Promise<Row[]> {
  const rows: Row[] = []
  let next = 0
  const lane = async () => {
    while (next < cuts.length) {
      const cut = cuts[next]
      next += 1
      if (cut === undefined) return
      const done = await crash(cut)
      rows.push(done)
      print(
        `${done.cut.padEnd(48)}${done.result.padEnd(12)}${String(Math.round(done.tookMs / 1000)).padEnd(6)}${done.detail.slice(0, 300)}`,
      )
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, lane))
  return rows.sort((left, right) => byCut(left.cut, right.cut))
}

function readExpected(): Expected {
  if (!existsSync(EXPECTED_PATH)) return { recorded: {}, red: [] }
  return JSON.parse(readFileSync(EXPECTED_PATH, 'utf8')) as Expected
}

const { values } = parseArgs({
  args: process.argv.slice(2).filter(arg => arg !== '--'),
  options: {
    only: { type: 'string', multiple: true },
    out: { type: 'string' },
    record: { type: 'boolean' },
  },
})

const print = (line: string) => process.stdout.write(`${line}\n`)
const began = Date.now()
const { recorded, threads } = await record(print)
const all = cutsOf(recorded)
if (values.record === true) {
  print(all.join('\n'))
  process.exit(all.length > 0 ? 0 : 1)
}

const expected = readExpected()
const basis = cutsOf(expected.recorded)
const extra = all.filter(cut => !basis.includes(cut))
const missing = basis.filter(cut => !all.includes(cut))
const only = values.only ?? []
const unknown = only.filter(cut => !all.includes(cut))
const chosen = only.length > 0 ? all.filter(cut => only.includes(cut)) : all
const rows = await pool(chosen, print)

const listed = new Map(expected.red.map(entry => [entry.cut, entry]))
const errors = rows.filter(row => row.result === 'error')
const red = rows.filter(row => row.result === 'diverged' || row.result === 'no-outcome')
const unlisted = red.filter(row => !listed.has(row.cut))
const greened = rows.filter(row => row.result === 'equivalent' && listed.has(row.cut))

const out =
  values.out ?? join(tmpdir(), `crash-matrix-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
mkdirSync(dirname(out), { recursive: true })
writeFileSync(
  out,
  `${JSON.stringify({ tookMs: Date.now() - began, recorded, threads, rows }, null, 2)}\n`,
)

print(
  `cuts ${String(rows.length)}: ${String(rows.filter(row => row.result === 'equivalent').length)} equivalent, ${String(red.length)} red, ${String(errors.length)} errors; ${String(Math.round((Date.now() - began) / 1000))} s; ${out}`,
)
for (const row of greened) print(`now equivalent, still listed: ${row.cut}`)
for (const row of unlisted) print(`red and not listed: ${row.cut} ${row.result}: ${row.detail}`)
for (const row of errors) print(`error: ${row.cut}: ${row.detail}`)
for (const cut of unknown) print(`not a recorded cut: ${cut}`)
if (extra.length > 0 || missing.length > 0)
  print(
    `recorded cuts differ from the list's basis: extra ${JSON.stringify(extra)}, missing ${JSON.stringify(missing)}`,
  )
const failed =
  unlisted.length > 0 ||
  errors.length > 0 ||
  unknown.length > 0 ||
  extra.length > 0 ||
  missing.length > 0
process.exit(failed ? 1 : 0)
