// pnpm run start:test [--packaged | --app <executable>] [--user-data-dir=<dir>] [Electron arguments]
// Starts the test profile, unpackaged by default, on a fresh user data directory unless one is named.
//
// Signals (POSIX): the app runs in its own session and process group, so a signal meant for this
// launcher (Ctrl+C, which the terminal sends to its foreground group) never reaches the app's helpers
// directly. Killed with them, Chromium's GPU process dies under a main process that is still quitting.
// And Electron answers only the first SIGINT or SIGTERM with its own quit, so the same signal arriving
// twice at once would cut that quit short. Instead every SIGINT, SIGTERM and SIGHUP is passed on to the
// app's main process alone, which then quits the way it does when asked. A second signal while the app
// still runs is passed on too; a third kills the app's whole group, as does a second once the main
// process has exited while a helper still holds its output open. Windows has no such signals: each one
// ends the app's whole tree.
import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { monitorTestChild } from './child-run.ts'
import {
  checkLaunchInputs,
  freshUserDataDir,
  launchEnvironment,
  launchSpec,
  removeUserDataDir,
} from './launch.ts'
import { listProcesses } from './release-launch.ts'

const note = (line: string) => process.stderr.write(`start:test: ${line}\n`)
const fail = (failure: unknown): never => {
  note(failure instanceof Error ? failure.message : String(failure))
  process.exit(1)
}

const args = process.argv.slice(2)
let packaged = false
let executable: string | undefined
if (args[0] === '--packaged') {
  packaged = true
  args.shift()
} else if (args[0] === '--app') {
  packaged = true
  executable = args[1] ?? fail('--app needs a packaged test-profile executable')
  args.splice(0, 2)
}
const named = args.findIndex(arg => arg.startsWith('--user-data-dir='))
const userDataDir =
  named >= 0
    ? args.splice(named, 1)[0]!.slice('--user-data-dir='.length)
    : freshUserDataDir('start-test')
const temporary = named < 0

let spec: ReturnType<typeof launchSpec>
try {
  spec = launchSpec(packaged ? 'packaged' : 'unpackaged', 'test', { executable, userDataDir })
  await checkLaunchInputs(spec)
} catch (failure) {
  if (temporary) removeUserDataDir(userDataDir)
  fail(failure)
}
note(`user data in ${userDataDir}${temporary ? ' (removed on exit)' : ''}`)

const preexisting = new Set(listProcesses().map(entry => entry.pid))
const spawnedAt =
  /* wall-clock: observation-time -- compared with process start times the OS reports */ Date.now()
const child = spawn(spec!.command, [...spec!.args, ...args], {
  cwd: spec!.cwd,
  env: launchEnvironment(process.env),
  stdio: ['inherit', 'pipe', 'inherit'],
  detached: process.platform !== 'win32',
})
const monitor = monitorTestChild(child, spec!, spawnedAt, {
  // Only a directory this launcher created marks the app's processes as its own.
  ...(temporary ? { userDataDir } : {}),
  preexisting,
})
child.stdout.pipe(process.stdout)

const running = () => child.exitCode === null && child.signalCode === null
let received = 0
let closed = false
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const)
  process.on(signal, () => {
    if (closed) return
    received += 1
    if (process.platform === 'win32') {
      monitor.abort(new Error(`the test launch was interrupted by ${signal}`))
      return
    }
    const pid = child.pid!
    if (!running()) {
      // The main process has exited, but a process of its group still holds the output open.
      if (received >= 2) {
        note(`${signal} again: the app has exited but its process group ${pid} lingers: killing it`)
        monitor.abort(new Error('the test launch was force-stopped'))
      } else
        note(`${signal}: the app has exited; waiting for its helpers, a second signal kills them`)
      return
    }
    if (received >= 3) {
      note(`${signal} again: killing the app's process group ${pid}`)
      monitor.abort(new Error('the test launch was force-stopped'))
      return
    }
    if (received === 2)
      note(`${signal} again: passing it on; the app (pid ${pid}) has not quit, a third kills it`)
    try {
      process.kill(pid, signal)
    } catch {}
  })

// Never leave quietly while the app still runs (this launcher failing): say so, and ask it to quit.
process.once('exit', () => {
  if (!running() || child.pid === undefined) return
  note(
    `exiting while the app (pid ${child.pid}) runs: sent it SIGTERM; its user data stays in ${userDataDir}`,
  )
  // Its main process only, as for any signal: it takes its helpers with it.
  child.kill('SIGTERM')
})

let cleaned = false
try {
  const code = await monitor.finished
  if (child.signalCode !== null) note(`the app was ended by ${child.signalCode}`)
  process.exitCode = code ?? 1
  if (code === 0 && readdirSync(userDataDir).length === 0)
    throw new Error(`the app left nothing in its user data directory ${userDataDir}`)
} catch (failure) {
  note(failure instanceof Error ? failure.message : String(failure))
  process.exitCode = 1
} finally {
  closed = true
  try {
    const killed = await monitor.reap()
    if (killed.length > 0) note(`stopped lingering helpers: ${killed.join(', ')}`)
    cleaned = true
  } catch (failure) {
    note(
      `cleanup failed: ${failure instanceof Error ? failure.message : String(failure)}; user data kept in ${userDataDir}`,
    )
    process.exitCode = 1
  }
  // Its helpers may still use the directory: it goes only once they are confirmed gone.
  if (cleaned && temporary) removeUserDataDir(userDataDir)
}
