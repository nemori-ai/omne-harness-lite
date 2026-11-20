// Starting, watching and ending the launches of `pnpm run verify:release`: each one leads its own
// process group, and only processes it created are ever counted or killed.
import { execFileSync, spawn } from 'node:child_process'
import { rmSync } from 'node:fs'
import { connect, createServer } from 'node:net'
import { dirname } from 'node:path'
import type { Readable, Writable } from 'node:stream'
import { freshUserDataDir, removeUserDataDir } from './launch.ts'
import {
  type LaunchRoot,
  launchProcesses,
  leftoverProcesses,
  parsePsListing,
  parseWindowsListing,
  type ProcessInfo,
  type ProcessLocation,
} from './release-processes.ts'
import { type LaunchOutcome, pipeReply } from './release-verdicts.ts'

export const isWindows = process.platform === 'win32'
export const sleep = (ms: number) => new Promise(done => setTimeout(done, ms))
const LEFTOVER_GRACE_MS = 5_000
const OUTPUT_GRACE_MS = 2_000
const PIPE_COMMAND = { id: 1, method: 'Browser.getVersion' }

export function powershellJson(command: string, extra: Record<string, string> = {}): string {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra }
  delete env['PSModulePath']
  return execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${command}`,
    ],
    { encoding: 'utf8', maxBuffer: 64 << 20, env },
  )
}

export function listProcesses(): ProcessInfo[] {
  if (isWindows)
    return parseWindowsListing(
      powershellJson(
        "Get-CimInstance Win32_Process -ErrorAction Stop | Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine,@{n='Created';e={if ($_.CreationDate) { [DateTimeOffset]::new($_.CreationDate).ToUnixTimeMilliseconds() } else { $null }}} | ConvertTo-Json -Compress",
      ),
    )
  const output = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,pgid=,stat=,lstart=,args='], {
    encoding: 'utf8',
    maxBuffer: 64 << 20,
    env: { ...process.env, LC_ALL: 'C' },
  })
  return parsePsListing(output)
}

export function kill(pid: number, signal: NodeJS.Signals = 'SIGKILL'): void {
  try {
    process.kill(pid, signal)
  } catch {}
}

/** The caller's environment without what changes what Electron or the app is. */
export function releaseEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [name, value] of Object.entries(process.env))
    if (value !== undefined && !/^(OMNE_|ELECTRON_|NODE_OPTIONS$)/.test(name)) env[name] = value
  return env
}

export type Running = {
  pid: number
  stdout(): string
  stderr(): string
  exited: Promise<LaunchOutcome>
  isRunning(): boolean
  extra: (Readable | Writable | null)[]
  expire(): void
}

export type Launch = Readonly<{
  app: Running
  root: LaunchRoot
  preexisting: ReadonlySet<number>
  location: ProcessLocation
}>

const launches = new Set<Launch>()
const tempDirs = new Set<string>()

export function tempDir(label: string): string {
  const directory = freshUserDataDir(label)
  tempDirs.add(directory)
  return directory
}

export function dropTempDir(directory: string): void {
  removeUserDataDir(directory)
  tempDirs.delete(directory)
}

export function killRunningTree(app: Running): void {
  if (!app.isRunning()) return
  if (!isWindows) return kill(-app.pid)
  try {
    execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {}
}

export const createdBy = (started: Launch): ProcessInfo[] =>
  launchProcesses(
    listProcesses(),
    started.root,
    started.preexisting,
    started.location,
    process.platform,
  )

function terminate(started: Launch, known: readonly ProcessInfo[] = []): void {
  killRunningTree(started.app)
  let created: ProcessInfo[] = []
  try {
    created = createdBy(started)
  } catch {}
  for (const process of [...known, ...created]) kill(process.pid)
}

/** For an interrupted or failed run: every launch's processes killed, every temporary directory gone. */
export function cleanUpEverything(): void {
  for (const started of launches) terminate(started)
  launches.clear()
  for (const directory of tempDirs)
    try {
      rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    } catch {}
  tempDirs.clear()
}

export type LaunchOptions = Readonly<{
  deadlineMs: number
  extraFds?: number
  env?: NodeJS.ProcessEnv
  onLine?: (line: string) => void
}>

export function launch(
  command: string,
  args: string[],
  location: ProcessLocation,
  options: LaunchOptions,
): Launch {
  const preexisting = new Set(listProcesses().map(process => process.pid))
  const spawnedAt =
    /* wall-clock: observation-time -- compared with process start times the OS reports */ Date.now()
  const child = spawn(command, args, {
    cwd: dirname(command),
    env: options.env ?? releaseEnv(),
    detached: !isWindows,
    stdio: [
      'ignore',
      'pipe',
      'pipe',
      ...Array.from({ length: options.extraFds ?? 0 }, () => 'pipe' as const),
    ],
  })
  const { pid, stdout: out, stderr: err } = child
  if (pid === undefined || out === null || err === null)
    throw new Error(`could not start ${command}`)
  let [stdout, stderr, pending] = ['', '', '']
  out.setEncoding('utf8').on('data', (chunk: string) => {
    stdout += chunk
    pending += chunk
    for (let newline = pending.indexOf('\n'); newline >= 0; newline = pending.indexOf('\n')) {
      options.onLine?.(pending.slice(0, newline).trim())
      pending = pending.slice(newline + 1)
    }
  })
  err.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk))
  let timedOut = false
  let running = true
  const app: Running = {
    pid,
    stdout: () => stdout,
    stderr: () => stderr,
    exited: Promise.resolve({ code: null, signal: null, timedOut: false, stdout: '' }),
    isRunning: () => running,
    extra: child.stdio.slice(3).map(stream => stream ?? null),
    expire: () => {
      if (!running) return
      timedOut = true
      killRunningTree(app)
    },
  }
  const timer = setTimeout(app.expire, options.deadlineMs)
  app.exited = new Promise(done => {
    let exit: { code: number | null; signal: string | null } | undefined
    const settle = () => {
      clearTimeout(timer)
      done({ code: exit?.code ?? null, signal: exit?.signal ?? null, timedOut, stdout })
    }
    child.once('error', failure => {
      running = false
      stderr += `${failure.message}\n`
      settle()
    })
    child.once('exit', (code, signal) => {
      running = false
      exit = { code, signal }
      setTimeout(settle, OUTPUT_GRACE_MS).unref()
    })
    child.once('close', () => exit !== undefined && settle())
  })
  for (const stream of app.extra) stream?.on('error', () => {})
  const started: Launch = { app, root: { pid, spawnedAt }, preexisting, location }
  launches.add(started)
  return started
}

/** Waits a little for the launch's processes to go, kills the rest, and says which were left. */
export async function finish(
  started: Launch,
  launched: readonly ProcessInfo[] = [],
): Promise<ProcessInfo[]> {
  const { root, preexisting, location } = started
  const left = () =>
    leftoverProcesses(
      listProcesses(),
      launched,
      root,
      preexisting,
      location,
      process.platform,
    ).filter(process => process.pid !== root.pid || started.app.isRunning())
  let leftovers = left()
  for (let waited = 0; leftovers.length > 0 && waited < LEFTOVER_GRACE_MS; waited += 100) {
    await sleep(100)
    leftovers = left()
  }
  terminate(started, leftovers)
  launches.delete(started)
  return leftovers
}

export function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer()
    server.once('error', fail)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() =>
        typeof address === 'object' && address ? done(address.port) : fail(new Error('no port')),
      )
    })
  })
}

function accepts(port: number, host: string): Promise<boolean> {
  return new Promise(done => {
    const socket = connect({ port, host })
    const settle = (result: boolean) => {
      socket.destroy()
      done(result)
    }
    socket.setTimeout(250, () => settle(false))
    socket.once('connect', () => settle(true))
    socket.once('error', () => settle(false))
  })
}

export const listening = async (port: number): Promise<boolean> =>
  (await accepts(port, '127.0.0.1')) || (await accepts(port, '::1'))

/** What the debugging port's /json/version says the browser is, if it answers. */
export async function devtoolsBrowser(port: number): Promise<string | undefined> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(1_000),
    })
    const browser: unknown = Reflect.get((await response.json()) as object, 'Browser')
    return typeof browser === 'string' && browser !== '' ? browser : undefined
  } catch {
    return undefined
  }
}

/** Sends `Browser.getVersion` down a launch's debugging pipe (fds 3 and 4) and reads the answer. */
export async function askOverPipe(
  app: Running,
  waitMs: number,
): Promise<Record<string, unknown> | undefined> {
  const [commands, replies] = app.extra
  let received = ''
  if (replies !== undefined && replies !== null && 'setEncoding' in replies)
    replies.setEncoding('utf8').on('data', (chunk: string) => (received += chunk))
  if (commands !== undefined && commands !== null && 'write' in commands)
    commands.write(`${JSON.stringify(PIPE_COMMAND)}\0`)
  for (
    let waited = 0;
    app.isRunning() && waited < waitMs && pipeReply(received, PIPE_COMMAND.id) === undefined;
    waited += 20
  )
    await sleep(20)
  if (commands !== undefined && commands !== null && 'end' in commands) commands.end()
  await sleep(50)
  return (
    pipeReply(received, PIPE_COMMAND.id) ??
    (received.length > 0 ? { unparsed: received.slice(0, 200) } : undefined)
  )
}
