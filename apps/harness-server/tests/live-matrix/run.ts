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
  renameSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createProtocolDriver, type ProtocolDriver } from '../support/matrix/protocol-driver.ts'
import {
  requiredCells,
  recordBaseline,
  currentModels,
  liveCells,
  type Baseline,
  type MatrixRow,
  type LiveCell,
} from './cells.ts'
import { measure, turnsOf, type Measured, type Turn } from './measure.ts'
import { executeCells } from './execute.ts'

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
  if (!Number.isFinite(budgetUsd) || !(budgetUsd > 0))
    throw new Error('--budget-usd <dollars> is required and must be positive')
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
  return requiredCells(cells, currentModels(), baseline)
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
    const observed = await driver.diagnostics(session)
    if (observed.outcome !== 'succeeded')
      throw new Error(`diagnostics answered ${observed.outcome}`)
    const history = await driver.readHistory(session)
    if (history.outcome !== 'succeeded' || !history.exhausted) throw new Error('incomplete history')
    const soFar = measure(turnsOf(cell.turns.slice(0, index + 1), observed.runs, history.entries))
    if (soFar.costUsd === null || soFar.unanswered > 0) break
  }
  const diagnostics = await driver.diagnostics(session)
  if (diagnostics.outcome !== 'succeeded')
    throw new Error(`diagnostics answered ${diagnostics.outcome}`)
  const history = await driver.readHistory(session)
  if (history.outcome !== 'succeeded' || !history.exhausted) throw new Error('incomplete history')
  const turns = turnsOf(cell.turns, diagnostics.runs, history.entries)
  return { measured: measure(turns), turns }
}

async function main(): Promise<number> {
  const options = optionsOf(process.argv.slice(2))
  const key = process.env['OPENROUTER_API_KEY'] ?? ''
  if (key === '') throw new Error('OPENROUTER_API_KEY is required')
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as Baseline
  const models = currentModels()
  const allCells = liveCells(models)
  const required = chosen(allCells, { ...options, only: [] }, baseline)
  const cells = chosen(allCells, options, baseline)
  if (cells.length === 0) throw new Error('no cells selected; no execution or baseline update')
  if (options.record && required.some(cell => !cells.some(selected => selected.id === cell.id)))
    throw new Error('--only omits required cells; cannot record this change')
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
  let rows: readonly MatrixRow[] = []
  const saveResults = (current: readonly MatrixRow[] = rows) => {
    rows = current
    writeFileSync(join(options.out, 'results.json'), `${JSON.stringify(rows, null, 2)}\n`)
  }
  writeFileSync(
    join(options.out, 'required.json'),
    `${JSON.stringify(
      required.map(cell => cell.id),
      null,
      2,
    )}\n`,
  )
  try {
    const driver = createProtocolDriver(server.origin)
    await until(
      'the server to accept a registration',
      () => driver.register(),
      outcome => outcome === 'succeeded',
    )
    if ((await driver.login()) !== 'succeeded') throw new Error('login failed')
    rows = await executeCells(
      cells,
      baseline,
      options.budgetUsd,
      cell => runCell(driver, cell),
      current => {
        saveResults(current)
        const row = current.at(-1)
        const rate = row?.measured?.hitRate
        console.log(
          `${String(row?.cell)}: ${String(row?.state)} hit=${rate === null || rate === undefined ? 'n/a' : rate.toFixed(3)} dropped=${String(row?.measured?.dropped ?? 'n/a')} cost=${String(row?.measured?.costUsd?.toFixed(6) ?? 'n/a')} ${row?.reasons.join('; ') ?? ''}`,
        )
      },
    )
  } finally {
    saveResults()
    await server.stop()
    await usage('after')
  }
  writeFileSync(join(options.out, 'results.json'), `${JSON.stringify(rows, null, 2)}\n`)
  const today = new Date().toISOString().slice(0, 10)
  for (const [id, entry] of Object.entries(baseline.cells))
    if (Date.now() - Date.parse(entry.measuredOn) > STALE_DAYS * 86_400_000)
      console.log(`${id}: measured ${entry.measuredOn}, more than ${String(STALE_DAYS)} days ago`)
  if (options.record) {
    const next = recordBaseline(allCells, models, baseline, cells, rows, today)
    const staged = `${baselinePath}.${String(process.pid)}.tmp`
    writeFileSync(staged, `${JSON.stringify(next, null, 2)}\n`)
    renameSync(staged, baselinePath)
  }
  return rows.length !== cells.length || rows.some(row => row.state !== 'green') ? 1 : 0
}

main().then(
  code => process.exit(code),
  error => {
    console.error(String(error instanceof Error ? error.message : error))
    process.exit(2)
  },
)
