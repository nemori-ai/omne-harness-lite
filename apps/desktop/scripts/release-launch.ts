// Starting, watching and ending the launches of `pnpm run verify:release`: each one leads its own
// process group, and only processes it created are ever counted or killed.
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { connect, createServer } from 'node:net'
import { dirname } from 'node:path'
import type { Readable, Writable } from 'node:stream'
import { freshUserDataDir, removeUserDataDir } from './launch.ts'
import { windowsProcess, windowsProcesses } from './powershell.ts'
import {
  type LaunchRoot,
  launchProcesses,
  leftoverProcesses,
  parsePsListing,
  type ProcessInfo,
  type ProcessLocation,
} from './release-processes.ts'
import { type LaunchOutcome, pipeReply } from './release-verdicts.ts'

export const isWindows = process.platform === 'win32'
export const sleep = (ms: number) => new Promise(done => setTimeout(done, ms))
const LEFTOVER_GRACE_MS = 5_000
const OUTPUT_GRACE_MS = 2_000
const TASKKILL_TIMEOUT_MS = 15_000
const PIPE_COMMAND = { id: 1, method: 'Browser.getVersion' }

export function listProcesses(): ProcessInfo[] {
  if (isWindows) return windowsProcesses()
  const output = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,pgid=,stat=,lstart=,args='], {
    encoding: 'utf8',
    maxBuffer: 64 << 20,
    timeout: 30_000,
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

/** Kept while a launch on it is still tracked: a process that may still run must not lose its directory. */
export function dropTempDir(directory: string): void {
  tempDirs.delete(directory)
  if ([...launches].some(({ root }) => root.userDataDir === directory)) {
    process.stdout.write(`verify:release: cleanup unconfirmed; keeping user data in ${directory}\n`)
    return
  }
  removeUserDataDir(directory)
}

export function killRunningTree(app: Running): void {
  if (!app.isRunning()) return
  if (!isWindows) return kill(-app.pid)
  try {
    execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], {
      stdio: 'ignore',
      timeout: TASKKILL_TIMEOUT_MS,
    })
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

/** Who started what: enough to tell a launch's processes from everything else on the machine. */
export type LaunchOwner = Readonly<{
  root: LaunchRoot
  preexisting: ReadonlySet<number>
  /** Only for an executable no other launcher starts, as verify:release's packages. */
  location?: ProcessLocation
}>

/** Kills the launch's processes other than its main one; helpers seen earlier are rechecked first. */
function killHelpers(owner: LaunchOwner, known: readonly ProcessInfo[]): void {
  let owned: ProcessInfo[] = []
  try {
    owned = leftoverProcesses(
      listProcesses(),
      known,
      owner.root,
      owner.preexisting,
      owner.location,
      process.platform,
    )
  } catch {}
  for (const entry of owned) {
    if (entry.pid === owner.root.pid) continue
    if (!isWindows) kill(entry.pid)
    else
      try {
        windowsProcess(entry, 'kill')
      } catch {}
  }
}

/** Kills what the launch created and nothing else. */
function terminate(started: Launch, known: readonly ProcessInfo[] = []): void {
  killRunningTree(started.app)
  killHelpers(started, known)
}

const stillThere = (entry: ProcessInfo): boolean => !isWindows || windowsProcess(entry, 'check')

/** Exit handlers run synchronously, so this waits by blocking; a launch it cannot confirm stays tracked. */
function confirmGone(started: Launch): void {
  const before = createdBy(started)
  terminate(started, before)
  for (let waited = 0; ; waited += 50) {
    const left = leftoverProcesses(
      listProcesses(),
      before,
      started.root,
      started.preexisting,
      started.location,
      process.platform,
    )
    if (!left.some(stillThere)) {
      launches.delete(started)
      return
    }
    if (waited >= OUTPUT_GRACE_MS) return
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
  }
}

/** For an interrupted or failed run: every launch's processes killed, and directories no process uses removed. */
export function cleanUpEverything(): void {
  for (const started of launches)
    try {
      confirmGone(started)
    } catch (failure) {
      killRunningTree(started.app)
      process.stdout.write(
        `verify:release: could not confirm interrupted launch cleanup: ${failure instanceof Error ? failure.message : String(failure)}\n`,
      )
    }
  for (const directory of tempDirs) dropTempDir(directory)
  launches.clear()
}

export type LaunchOptions = Readonly<{
  deadlineMs: number
  /** After the deadline's kill, how long to wait for the exit before giving up on it. */
  stopGraceMs?: number
  extraFds?: number
  env?: NodeJS.ProcessEnv
  onLine?: (line: string) => void
}>

export async function launch(
  command: string,
  args: string[],
  location: ProcessLocation,
  options: LaunchOptions,
): Promise<Launch> {
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
  // A spawn that fails rejects here, with the reason, instead of looking like an empty run.
  await once(child, 'spawn')
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
  let stopTimer: ReturnType<typeof setTimeout> | undefined
  let settle = () => {}
  const app: Running = {
    pid,
    stdout: () => stdout,
    stderr: () => stderr,
    exited: Promise.resolve({ code: null, signal: null, timedOut: false, stdout: '' }),
    isRunning: () => running,
    extra: child.stdio.slice(3).map(stream => stream ?? null),
    expire: () => {
      if (!running || timedOut) return
      timedOut = true
      stopTimer = setTimeout(() => {
        if (!running) return
        child.unref()
        settle()
      }, options.stopGraceMs ?? OUTPUT_GRACE_MS)
      killRunningTree(app)
    },
  }
  const timer = setTimeout(app.expire, options.deadlineMs)
  app.exited = new Promise(done => {
    let exit: { code: number | null; signal: string | null } | undefined
    settle = () => {
      clearTimeout(timer)
      clearTimeout(stopTimer)
      for (const pipe of child.stdio) pipe?.destroy()
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
  const userDataDir = args
    .find(arg => arg.startsWith('--user-data-dir='))
    ?.slice('--user-data-dir='.length)
  const root = { pid, spawnedAt, ...(userDataDir === undefined ? {} : { userDataDir }) }
  const started: Launch = { app, root, preexisting, location }
  launches.add(started)
  return started
}

/**
 * After a launch's main process exited: waits for its helpers, kills and rechecks those that linger,
 * and returns them. Throws when it cannot confirm they are gone.
 */
export async function reapHelpers(
  owner: LaunchOwner,
  launched: readonly ProcessInfo[] = [],
  graceMs = LEFTOVER_GRACE_MS,
): Promise<ProcessInfo[]> {
  const seen = new Map(launched.map(entry => [entry.pid, entry]))
  const waitForHelpers = async (): Promise<ProcessInfo[]> => {
    for (let waited = 0; ; waited += 100) {
      const left = leftoverProcesses(
        listProcesses(),
        [...seen.values()],
        owner.root,
        owner.preexisting,
        owner.location,
        process.platform,
      ).filter(entry => entry.pid !== owner.root.pid)
      for (const entry of left) seen.set(entry.pid, entry)
      if (left.length === 0 || waited >= graceMs) return left
      await sleep(100)
    }
  }
  const lingering = await waitForHelpers()
  if (lingering.length === 0) return []
  killHelpers(owner, lingering)
  const remaining = (await waitForHelpers()).filter(stillThere)
  if (remaining.length > 0)
    throw new Error(
      `could not confirm the exit of helpers after killing them: ${remaining.map(entry => entry.pid).join(', ')}`,
    )
  return lingering
}

/** `reapHelpers` for a tracked launch; one whose exit it cannot confirm stays tracked, and keeps its directory. */
export async function finish(
  started: Launch,
  launched: readonly ProcessInfo[] = [],
  graceMs = LEFTOVER_GRACE_MS,
): Promise<ProcessInfo[]> {
  if (started.app.isRunning())
    throw new Error(`could not confirm the exit of process ${started.app.pid} after it was stopped`)
  const lingering = await reapHelpers(started, launched, graceMs)
  launches.delete(started)
  return lingering
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
