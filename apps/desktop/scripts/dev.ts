// pnpm run dev: the dev profile in watch mode. A rebuilt page reloads the window inside the app;
// a rebuilt main or utility bundle restarts the app. Either way the login stays: it is a cookie.
import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'vite'
import { BUNDLES, bundleDir } from './build-profile.ts'
import { writeManifest } from './build.ts'
import { bundleConfig, desktopDir, pageConfig } from './bundle-build.ts'
import { launchEnvironment, launchSpec, verifyBuildProfile } from './launch.ts'

type Watcher = Readonly<{
  on(
    event: 'event',
    listener: (event: { code: string; result?: { close(): unknown } }) => void,
  ): unknown
  close(): Promise<void>
}>

const say = (line: string) => process.stderr.write(`dev: ${line}\n`)

/** Starts one watch build; resolves once its first build is done, then calls `rebuilt` after each. */
async function watchBuild(
  config: Parameters<typeof build>[0],
  rebuilt?: () => void,
): Promise<Watcher> {
  const watcher = (await build(config)) as unknown as Watcher
  return new Promise((done, fail) => {
    let first = true
    watcher.on('event', event => {
      event.result?.close()
      if (event.code === 'ERROR' && first) fail(new Error('the first dev build failed'))
      if (event.code !== 'END') return
      if (first) {
        first = false
        done(watcher)
      } else rebuilt?.()
    })
  })
}

/** How long an app asked to quit gets before its whole group is killed. */
const QUIT_GRACE_MS = 3_000

let app: ChildProcess | undefined
/** Every app started and not yet exited: the current one, and one a restart is still ending. */
const running = new Set<ChildProcess>()
let stopping = false
let exiting = false
let restartTimer: ReturnType<typeof setTimeout> | undefined
const watchers: Watcher[] = []

const alive = (child: ChildProcess) => child.exitCode === null && child.signalCode === null

/**
 * Asks the app to quit: SIGTERM to its main process only, which then flushes the cookies and ends its
 * helpers; signalling the group would kill the network service before the flush. Windows has no such
 * signal: the tree ends at once.
 */
function quit(child: ChildProcess): void {
  if (!alive(child) || child.pid === undefined) return
  if (process.platform === 'win32') return forceQuit(child)
  child.kill('SIGTERM')
}

/** Kills the app with its helpers: its process group (POSIX) or tree (Windows). */
function forceQuit(child: ChildProcess): void {
  if (!alive(child) || child.pid === undefined) return
  try {
    if (process.platform === 'win32')
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    else process.kill(-child.pid, 'SIGKILL')
  } catch {
    child.kill('SIGKILL')
  }
}

/** Resolves once `child` has exited, killing its group if it has not within the grace period. */
function ended(child: ChildProcess): Promise<void> {
  if (!alive(child)) return Promise.resolve()
  return new Promise(done => {
    const lingering = setTimeout(() => forceQuit(child), QUIT_GRACE_MS)
    child.once('exit', () => {
      clearTimeout(lingering)
      done()
    })
  })
}

function stop(code: number): void {
  if (exiting) return
  exiting = stopping = true
  clearTimeout(restartTimer)
  // Each app leads its own process group: an exit of this script would not end it.
  for (const child of running) quit(child)
  void Promise.allSettled([
    ...[...running].map(ended),
    ...watchers.map(watcher => watcher.close()),
  ]).finally(() => process.exit(code))
}

function startApp(): void {
  const spec = launchSpec('unpackaged', 'dev')
  // Arguments after `pnpm run dev` go to Electron, after the launch's own.
  const started = spawn(spec.command, [...spec.args, ...process.argv.slice(2)], {
    cwd: spec.cwd,
    env: launchEnvironment(process.env),
    stdio: ['ignore', 'pipe', 'inherit'],
    detached: process.platform !== 'win32',
  })
  app = started
  running.add(started)
  started.once('exit', () => running.delete(started))
  verifyBuildProfile(started.stdout!, 'dev').catch((failure: unknown) => {
    // A restart ends the old app on purpose, often before it reports its profile.
    if (app !== started) return
    say(failure instanceof Error ? failure.message : String(failure))
    stop(1)
  })
  started.stdout!.pipe(process.stdout)
  started.once('exit', (code, signal) => {
    if (app !== started) return
    if (stopping) return stop(0)
    // The person closed the window: development ends with it. A crash ends it as a failure.
    if (signal !== null || code !== 0) say(`the app exited with ${signal ?? code}`)
    stop(signal === null ? (code ?? 1) : 1)
  })
}

function restartApp(): void {
  const old = app
  if (old === undefined || stopping) return
  app = undefined
  say('the main side was rebuilt; restarting the app')
  // The single-instance lock: the new process starts after the old one is gone, killed if it lingers.
  void ended(old).then(() => {
    if (!stopping) startApp()
  })
  quit(old)
}

const restartSoon = () => {
  clearTimeout(restartTimer)
  restartTimer = setTimeout(restartApp, 300)
}

let built = false
try {
  rmSync(resolve(desktopDir, bundleDir('dev')), { recursive: true, force: true })
  writeManifest('dev')
  watchers.push(await watchBuild(pageConfig('dev', true)))
  for (const bundle of BUNDLES)
    watchers.push(await watchBuild(bundleConfig('dev', bundle, true), restartSoon))
  built = true
} catch (failure) {
  say(failure instanceof Error ? failure.message : String(failure))
  stop(1)
}
if (built) startApp()
process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
