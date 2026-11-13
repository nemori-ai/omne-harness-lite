import { spawn, spawnSync, type ChildProcessByStdio } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { DEFAULT_SHUTDOWN_DEADLINE_MS } from '../../../dist/local/operator-defaults.js'
import { localServeInputs } from '../../../dist/local/serve-local.js'

const memberDir = fileURLToPath(new URL('../../..', import.meta.url))
const serverBin = join(memberDir, 'dist', 'bin.js')
const distributionPath = join(memberDir, 'config', 'serve.distribution.json')
const FAKE_CREDENTIAL = 'sk-or-v1-matrix-stub-not-a-real-key'
const STARTUP_TIMEOUT_MS = 90_000

export type LogRecord = Readonly<{ kind?: string; level?: string; component?: string; name?: string }> &
  Record<string, unknown>

export type StopReport = Readonly<{
  signal: 'SIGTERM' | 'SIGKILL'
  tookMs: number
  code: number | null
  shutdown: LogRecord | undefined
}>

export type Environment = Readonly<{
  base: string
  workspace: string
  stateDir: string
  domainsDir: string
  port: number
  origin: string
  pid(): number | undefined
  running(): boolean
  start(extraArgs?: readonly string[]): Promise<void>
  stop(deadlineMs?: number): Promise<StopReport>
  kill(): Promise<StopReport>
  restart(how: 'stop' | 'kill', extraArgs?: readonly string[]): Promise<StopReport>
  output(): string
  records(): LogRecord[]
  mark(): number
  warnings(since: number): string[]
  cpuPercent(seconds: number): Promise<number>
  dispose(): Promise<string[]>
}>

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      probe.close(() => resolve(port))
    })
  })
}

function childEnv(home: string, base: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env['PATH'] ?? '/usr/bin:/bin',
    HOME: base,
    OMNE_SERVER_HOME: home,
    NO_COLOR: '1',
  }
  for (const name of ['USER', 'LANG', 'LC_ALL', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS'])
    if (process.env[name] !== undefined) env[name] = process.env[name]
  return env
}

function visitEndpoints(value: unknown, url: string): number {
  if (Array.isArray(value)) return value.reduce((sum: number, item) => sum + visitEndpoints(item, url), 0)
  if (value === null || typeof value !== 'object') return 0
  const record = value as Record<string, unknown>
  let changed = 0
  const stage = record['sendStage']
  if (stage !== null && typeof stage === 'object' && 'endpoints' in stage) {
    const sendStage = stage as Record<string, unknown>
    sendStage['endpoints'] = { ...(sendStage['endpoints'] as object), openrouter: url }
    changed += 1
  }
  for (const child of Object.values(record)) changed += visitEndpoints(child, url)
  return changed
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

function unitsOwnedBy(base: string): string[] {
  const listed = spawnSync('systemctl', ['--user', 'list-units', '--plain', '--no-legend', '--all', 'omne-host-*.scope'], {
    encoding: 'utf8',
  })
  if (listed.status !== 0) return []
  const owned: string[] = []
  for (const line of listed.stdout.split('\n')) {
    const unit = line.trim().split(/\s+/)[0]
    if (unit === undefined || unit === '') continue
    const shown = spawnSync('systemctl', ['--user', 'show', '-p', 'ControlGroup', '--value', unit], { encoding: 'utf8' })
    const group = shown.stdout.trim()
    if (group === '') continue
    let pids: string[] = []
    try {
      pids = readFileSync(join('/sys/fs/cgroup', group, 'cgroup.procs'), 'utf8').split('\n').filter(Boolean)
    } catch {
      continue
    }
    const mine = pids.some(pid => {
      try {
        if (readlinkSync(`/proc/${pid}/cwd`).startsWith(base)) return true
        return readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').some(entry => entry.includes(base))
      } catch {
        return false
      }
    })
    if (mine) owned.push(unit)
  }
  return owned
}

export async function createEnvironment(options: { modelUrl: string; certPath: string }): Promise<Environment> {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'matrix-env-')))
  const home = join(base, 'home')
  const workspace = join(base, 'workspace')
  mkdirSync(home)
  mkdirSync(workspace)
  const port = await freePort()
  const env = childEnv(home, base)
  const setup = spawnSync(process.execPath, [serverBin, 'setup', '--port', String(port), '--workspace', workspace], {
    cwd: base,
    env,
    input: `${FAKE_CREDENTIAL}\n`,
    encoding: 'utf8',
  })
  if (setup.status !== 0) throw new Error(`setup failed: ${setup.stderr}`)
  const distribution: unknown = JSON.parse(readFileSync(distributionPath, 'utf8'))
  const local = localServeInputs({
    platform: process.platform,
    env: { OMNE_SERVER_HOME: home },
    home: base,
    needOperator: true,
    needStateRoot: true,
    distribution,
    shutdownDeadlineMs: DEFAULT_SHUTDOWN_DEADLINE_MS,
  })
  if (local.kind !== 'ready' || local.operator === undefined) throw new Error(`no local operator layer: ${JSON.stringify(local)}`)
  const layer: unknown = JSON.parse(JSON.stringify(local.operator))
  if (visitEndpoints(layer, options.modelUrl) !== 1) throw new Error('the operator layer has no single model endpoint table')
  const operatorPath = join(base, 'operator.json')
  writeFileSync(operatorPath, JSON.stringify(layer, null, 2), { mode: 0o600 })
  const stateDir = join(home, 'state')

  let child: ChildProcessByStdio<null, Readable, Readable> | undefined
  let exited: Promise<number | null> = Promise.resolve(null)
  let output = ''

  const records = (): LogRecord[] =>
    output
      .split('\n')
      .filter(line => line.startsWith('{'))
      .flatMap(line => {
        try {
          return [JSON.parse(line) as LogRecord]
        } catch {
          return []
        }
      })

  const start = async (extraArgs: readonly string[] = []): Promise<void> => {
    if (child !== undefined && child.exitCode === null) throw new Error('the server is already running')
    const from = output.length
    const spawned = spawn(process.execPath, [serverBin, 'serve', '--operator', operatorPath, ...extraArgs], {
      cwd: base,
      env: { ...env, NODE_EXTRA_CA_CERTS: options.certPath },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child = spawned
    spawned.stdout.setEncoding('utf8').on('data', (chunk: string) => (output += chunk))
    spawned.stderr.setEncoding('utf8').on('data', (chunk: string) => (output += chunk))
    exited = new Promise(resolve => spawned.on('close', code => resolve(code)))
    const until = Date.now() + STARTUP_TIMEOUT_MS
    while (!output.slice(from).includes('"kind":"startup-result"')) {
      if (spawned.exitCode !== null) throw new Error(`serve exited before startup:\n${output.slice(from, from + 4000)}`)
      if (Date.now() > until) throw new Error('serve did not report startup in time')
      await sleep(50)
    }
    const startup = output
      .slice(from)
      .split('\n')
      .find(line => line.includes('"kind":"startup-result"'))
    if (startup === undefined || !startup.includes('"accepting":true')) throw new Error(`serve did not start accepting: ${String(startup).slice(0, 600)}`)
  }

  const finish = async (signal: 'SIGTERM' | 'SIGKILL', deadlineMs: number): Promise<StopReport> => {
    const running = child
    if (running === undefined || running.exitCode !== null) return { signal, tookMs: 0, code: running?.exitCode ?? null, shutdown: undefined }
    const from = output.length
    const began = Date.now()
    running.kill(signal)
    const timer = new Promise<'late'>(resolve => setTimeout(() => resolve('late'), deadlineMs))
    const first = await Promise.race([exited, timer])
    if (first === 'late') running.kill('SIGKILL')
    const code = await exited
    const tookMs = Date.now() - began
    const shutdown = output
      .slice(from)
      .split('\n')
      .filter(line => line.includes('"kind":"shutdown-result"'))
      .map(line => JSON.parse(line) as LogRecord)
      .at(-1)
    return { signal, tookMs, code, shutdown }
  }

  const environment: Environment = {
    base,
    workspace,
    stateDir,
    domainsDir: join(stateDir, 'storage', 'domains'),
    port,
    origin: `http://127.0.0.1:${String(port)}`,
    pid: () => (child !== undefined && child.exitCode === null ? child.pid : undefined),
    running: () => child !== undefined && child.exitCode === null,
    start,
    stop: (deadlineMs = 200_000) => finish('SIGTERM', deadlineMs),
    kill: () => finish('SIGKILL', 30_000),
    restart: async (how, extraArgs = []) => {
      const report = how === 'stop' ? await finish('SIGTERM', 200_000) : await finish('SIGKILL', 30_000)
      await start(extraArgs)
      return report
    },
    output: () => output,
    records,
    mark: () => records().length,
    warnings: since =>
      records()
        .slice(since)
        .filter(record => record.level === 'warn' || record.level === 'error')
        .map(record => {
          const fields = record['fields'] as { text?: string } | undefined
          return `${String(record.level)} ${String(record.component ?? record.name ?? '')}: ${String(fields?.text ?? JSON.stringify(record).slice(0, 200))}`
        }),
    cpuPercent: async seconds => {
      const pid = environment.pid()
      if (pid === undefined) return Number.NaN
      const ticks = () => {
        const fields = readFileSync(`/proc/${String(pid)}/stat`, 'utf8').split(') ')[1]?.split(' ') ?? []
        return Number(fields[11]) + Number(fields[12])
      }
      const before = ticks()
      await sleep(seconds * 1000)
      const after = ticks()
      const hertz = Number(spawnSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).stdout.trim() || '100')
      return ((after - before) * 100) / hertz / seconds
    },
    dispose: async () => {
      await finish('SIGKILL', 30_000)
      const stopped: string[] = []
      for (const unit of unitsOwnedBy(base)) {
        spawnSync('systemctl', ['--user', 'stop', unit], { stdio: 'ignore' })
        stopped.push(unit)
      }
      rmSync(base, { recursive: true, force: true })
      return stopped
    },
  }
  return environment
}
