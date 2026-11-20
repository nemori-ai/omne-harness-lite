// pnpm run dev: the dev profile in watch mode. A rebuilt page reloads the window inside the app;
// a rebuilt main or utility bundle restarts the app. Either way the login stays: it is a cookie.
import { type ChildProcess, spawn } from 'node:child_process'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'vite'
import { BUNDLES, bundleDir } from './build-profile.ts'
import { writeManifest } from './build.ts'
import { bundleConfig, desktopDir, pageConfig } from './bundle-build.ts'
import { launchEnvironment, launchSpec, verifyBuildProfile } from './launch.ts'
import { forwardSignals } from './signals.ts'

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

let app: ChildProcess | undefined
let stopping = false
let exiting = false
let restartTimer: ReturnType<typeof setTimeout> | undefined
const watchers: Watcher[] = []

function stop(code: number): void {
  if (exiting) return
  exiting = stopping = true
  clearTimeout(restartTimer)
  void Promise.allSettled(watchers.map(watcher => watcher.close())).finally(() =>
    process.exit(code),
  )
}

function startApp(): void {
  const spec = launchSpec('unpackaged', 'dev')
  const started = spawn(spec.command, spec.args, {
    cwd: spec.cwd,
    env: launchEnvironment(process.env),
    stdio: ['ignore', 'pipe', 'inherit'],
    detached: process.platform !== 'win32',
  })
  app = started
  verifyBuildProfile(started.stdout!, 'dev').catch((failure: unknown) => {
    say(failure instanceof Error ? failure.message : String(failure))
    started.kill('SIGKILL')
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
  const lingering = setTimeout(() => old.kill('SIGKILL'), 3000)
  lingering.unref()
  old.once('exit', () => {
    clearTimeout(lingering)
    if (!stopping) startApp()
  })
  old.kill('SIGTERM')
}

const restartSoon = () => {
  clearTimeout(restartTimer)
  restartTimer = setTimeout(restartApp, 300)
}

try {
  rmSync(resolve(desktopDir, bundleDir('dev')), { recursive: true, force: true })
  writeManifest('dev')
  watchers.push(await watchBuild(pageConfig('dev', true)))
  for (const bundle of BUNDLES)
    watchers.push(await watchBuild(bundleConfig('dev', bundle, true), restartSoon))
} catch (failure) {
  say(failure instanceof Error ? failure.message : String(failure))
  stop(1)
}
startApp()
forwardSignals(
  () => app,
  say,
  () => {
    stopping = true
    if (app === undefined) stop(0)
  },
)
