// The live model matrix: real requests through the gateway, so it costs money and never runs in
// the ordinary test layers. Run from apps/harness-server after a build:
//   OPENROUTER_API_KEY=<key> pnpm run live-matrix --budget-usd <dollars> [--only <cell>]...
//     [--changed <commit>] [--record] [--out <directory>]
// The key goes only into the setup's standard input and the authorization header of the usage
// read. Each cell starts only while what was spent plus the dearest cell so far stays in budget.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createProtocolDriver, type ProtocolDriver } from '../support/matrix/protocol-driver.ts'
import {
  baselineProblems,
  currentModels,
  liveCells,
  revisionsOf,
  type Baseline,
  type BaselineEntry,
  type LiveCell,
} from './cells.ts'
import { fitsBudget, judge, measure, turnsOf, type Measured, type Turn } from './measure.ts'

const here = dirname(fileURLToPath(import.meta.url))
const member = join(here, '..', '..')
const serverBin = join(member, 'dist', 'bin.js')
const baselinePath = join(here, 'baseline.json')
const QUESTIONS = [
  'Answer in one short sentence and use no tools: what is 17 times 3?',
  'Answer in one short sentence and use no tools: what is 19 times 4?',
  'Answer in one short sentence and use no tools: what is 23 times 5?',
]
const TURN_BOUND_MS = 240_000
const STALE_DAYS = 30

type Options = Readonly<{
  budgetUsd: number
  only: readonly string[]
  changed: string | null
  record: boolean
  out: string
}>

function optionsOf(args: readonly string[]): Options {
  let budgetUsd = Number.NaN
  const only: string[] = []
  let changed: string | null = null
  let record = false
  let out = join(tmpdir(), `live-matrix-${new Date().toISOString().replaceAll(':', '-')}`)
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]
    const value = () => {
      const given = args[(index += 1)]
      if (given === undefined) throw new Error(`${flag} needs a value`)
      return given
    }
    if (flag === '--budget-usd') budgetUsd = Number(value())
    else if (flag === '--only') only.push(value())
    else if (flag === '--changed') changed = value()
    else if (flag === '--record') record = true
    else if (flag === '--out') out = value()
    else throw new Error(`unknown argument ${String(flag)}`)
  }
  if (!(budgetUsd > 0)) throw new Error('--budget-usd <dollars> is required and must be positive')
  return { budgetUsd, only, changed, record, out }
}

function chosen(cells: readonly LiveCell[], options: Options, baseline: Baseline) {
  if (options.only.length > 0) {
    const unknown = options.only.filter(id => !cells.some(cell => cell.id === id))
    if (unknown.length > 0) throw new Error(`no such cell: ${unknown.join(', ')}`)
    return cells.filter(cell => options.only.includes(cell.id))
  }
  if (options.changed === null) return cells
  const engines = spawnSync(
    'git',
    ['diff', '--name-only', options.changed, '--', 'packages/model/pi-ai-transport/src'],
    { cwd: join(member, '..', '..'), encoding: 'utf8' },
  )
  if (engines.status !== 0) throw new Error(`git diff failed: ${engines.stderr}`)
  if (engines.stdout.trim() !== '') return cells
  // A record that changed has a new revision, so its expectations no longer match.
  const stale = new Set(
    baselineProblems(cells, currentModels(), baseline).map(line => line.split(':')[0]),
  )
  return cells.filter(cell => stale.has(cell.id))
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() =>
        typeof address === 'object' && address !== null
          ? resolve(address.port)
          : reject(new Error('no port')),
      )
    })
  })
}

async function keyUsage(key: string): Promise<number | null> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/key', {
      headers: { authorization: `Bearer ${key}` },
    })
    if (!response.ok) return null
    const body = (await response.json()) as { data?: { usage?: unknown } }
    return typeof body.data?.usage === 'number' ? body.data.usage : null
  } catch {
    return null
  }
}

async function until<T>(label: string, read: () => Promise<T>, done: (value: T) => boolean) {
  const deadline = Date.now() + TURN_BOUND_MS
  for (;;) {
    const value = await read()
    if (done(value)) return value
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`)
    await new Promise(resolve => setTimeout(resolve, 1_500))
  }
}

type Server = Readonly<{ origin: string; stop(): Promise<void> }>

async function startServer(key: string, out: string): Promise<Server> {
  if (!existsSync(serverBin)) throw new Error(`build the member first: ${serverBin} is missing`)
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'live-matrix-home-')))
  const home = join(base, 'home')
  const workspace = join(base, 'workspace')
  mkdirSync(home)
  mkdirSync(workspace)
  const port = await freePort()
  const env = {
    PATH: process.env['PATH'] ?? '/usr/bin:/bin',
    HOME: base,
    OMNE_SERVER_HOME: home,
    NO_COLOR: '1',
  }
  const setup = spawnSync(
    process.execPath,
    [serverBin, 'setup', '--port', String(port), '--workspace', workspace],
    {
      cwd: base,
      env,
      input: `${key}\n`,
      encoding: 'utf8',
    },
  )
  if (setup.status !== 0) throw new Error(`setup failed with ${String(setup.status)}`)
  const log = join(out, 'serve.log')
  const child: ChildProcess = spawn(
    process.execPath,
    ['--import', join(here, 'capture.mjs'), serverBin, 'serve'],
    {
      cwd: base,
      env: { ...env, LIVE_MATRIX_EXCHANGES: join(out, 'exchanges.jsonl') },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  child.stdout?.on('data', (chunk: Buffer) => appendFileSync(log, chunk))
  child.stderr?.on('data', (chunk: Buffer) => appendFileSync(log, chunk))
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  return {
    origin: `http://127.0.0.1:${String(port)}`,
    stop: async () => {
      child.kill('SIGTERM')
      await exited
    },
  }
}

async function runCell(
  driver: ProtocolDriver,
  cell: LiveCell,
): Promise<Readonly<{ measured: Measured; turns: readonly Turn[] }>> {
  const session = await driver.createSession()
  let current: string | null = null
  for (const [index, route] of cell.turns.entries()) {
    if (route !== current) {
      const selected = await driver.selectModel(session, route)
      if (selected !== 'succeeded') throw new Error(`select-model ${route} answered ${selected}`)
      current = route
    }
    const sent = await driver.send(session, QUESTIONS[index % QUESTIONS.length] ?? '')
    if (sent !== 'succeeded') throw new Error(`send-input answered ${sent}`)
    await until(
      `turn ${String(index + 1)} of ${cell.id}`,
      () => driver.readHistory(session),
      read => read.entries.filter(entry => entry.kind === 'run.terminal').length > index,
    )
  }
  const diagnostics = await driver.diagnostics(session)
  if (diagnostics.outcome !== 'succeeded')
    throw new Error(`diagnostics answered ${diagnostics.outcome}`)
  const history = await driver.readHistory(session)
  const turns = turnsOf(cell.turns, diagnostics.runs, history.entries)
  return { measured: measure(turns), turns }
}

type Row = Readonly<{
  cell: string
  state: 'green' | 'red' | 'error' | 'not-run'
  reasons: readonly string[]
  measured: Measured | null
  turns?: readonly Turn[]
}>

async function main(): Promise<number> {
  const options = optionsOf(process.argv.slice(2))
  const key = process.env['OPENROUTER_API_KEY'] ?? ''
  if (key === '') throw new Error('OPENROUTER_API_KEY is required')
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as Baseline
  const models = currentModels()
  const cells = chosen(liveCells(models), options, baseline)
  mkdirSync(options.out, { recursive: true })
  const spend = join(options.out, 'spend.tsv')
  writeFileSync(spend, 'time\tevent\tkey_usage_usd\n')
  const usage = async (event: string) =>
    appendFileSync(spend, `${new Date().toISOString()}\t${event}\t${String(await keyUsage(key))}\n`)
  await usage('before')
  console.log(
    `live matrix: ${String(cells.length)} cell(s), budget ${String(options.budgetUsd)} USD, out ${options.out}`,
  )
  const server = await startServer(key, options.out)
  const rows: Row[] = []
  try {
    const driver = createProtocolDriver(server.origin)
    await until(
      'the server to accept a registration',
      () => driver.register(),
      outcome => outcome === 'succeeded',
    )
    if ((await driver.login()) !== 'succeeded') throw new Error('login failed')
    let spent = 0
    let dearest = 0
    for (const cell of cells) {
      if (!fitsBudget(spent, dearest, options.budgetUsd)) {
        rows.push({ cell: cell.id, state: 'not-run', reasons: ['budget'], measured: null })
        continue
      }
      try {
        const { measured, turns } = await runCell(driver, cell)
        spent += measured.costUsd
        dearest = Math.max(dearest, measured.costUsd)
        const reasons = judge(measured, baseline.cells[cell.id])
        rows.push({
          cell: cell.id,
          state: reasons.length === 0 ? 'green' : 'red',
          reasons,
          measured,
          turns,
        })
      } catch (error) {
        rows.push({ cell: cell.id, state: 'error', reasons: [String(error)], measured: null })
      }
      const row = rows.at(-1)
      const rate = row?.measured?.hitRate
      console.log(
        `${cell.id}: ${String(row?.state)} hit=${rate === null || rate === undefined ? 'n/a' : rate.toFixed(3)} dropped=${String(row?.measured?.dropped ?? 'n/a')} cost=${String(row?.measured?.costUsd.toFixed(6) ?? 'n/a')} ${row?.reasons.join('; ') ?? ''}`,
      )
    }
    console.log(`spent by the diagnostics: ${spent.toFixed(6)} USD`)
  } finally {
    await server.stop()
    await usage('after')
  }
  writeFileSync(join(options.out, 'results.json'), `${JSON.stringify(rows, null, 2)}\n`)
  const today = new Date().toISOString().slice(0, 10)
  for (const [id, entry] of Object.entries(baseline.cells))
    if (Date.now() - Date.parse(entry.measuredOn) > STALE_DAYS * 86_400_000)
      console.log(`${id}: measured ${entry.measuredOn}, more than ${String(STALE_DAYS)} days ago`)
  if (options.record) {
    const recorded: Record<string, BaselineEntry> = { ...baseline.cells }
    for (const row of rows) {
      const cell = cells.find(item => item.id === row.cell)
      if (row.measured === null || cell === undefined || row.state === 'error') continue
      recorded[row.cell] = {
        measuredOn: today,
        revisions: revisionsOf(cell, models),
        hitRate: row.measured.hitRate === null ? null : Number(row.measured.hitRate.toFixed(3)),
        dropped: row.measured.dropped,
        costUsd: Number(row.measured.costUsd.toFixed(6)),
      }
    }
    const sorted = Object.fromEntries(Object.entries(recorded).sort(([a], [b]) => (a < b ? -1 : 1)))
    writeFileSync(baselinePath, `${JSON.stringify({ cells: sorted }, null, 2)}\n`)
  }
  return rows.some(row => row.state === 'red' || row.state === 'error') ? 1 : 0
}

main().then(
  code => process.exit(code),
  error => {
    console.error(String(error instanceof Error ? error.message : error))
    process.exit(2)
  },
)
