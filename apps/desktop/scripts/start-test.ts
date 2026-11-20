// pnpm run start:test [--packaged | --app <executable>] [--user-data-dir=<dir>] [Electron arguments]
// Starts the test profile, unpackaged by default, on a fresh user data directory unless one is named.
import { spawn } from 'node:child_process'
import {
  checkLaunchInputs,
  freshUserDataDir,
  launchEnvironment,
  launchSpec,
  removeUserDataDir,
  verifyBuildProfile,
} from './launch.ts'
import { listProcesses, type LaunchOwner, reapHelpers } from './release-launch.ts'
import { forwardSignals } from './signals.ts'

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
let wrongBuild = false
verifyBuildProfile(child.stdout, 'test').catch((failure: unknown) => {
  wrongBuild = true
  note(failure instanceof Error ? failure.message : String(failure))
  child.kill('SIGKILL')
})
child.stdout.pipe(process.stdout)
forwardSignals(() => child, note)

process.once('exit', () => {
  if (child.exitCode !== null || child.signalCode !== null) return
  note(`exiting while the app (pid ${child.pid}) runs: sent it SIGTERM`)
  child.kill('SIGTERM')
})
child.once('error', failure => {
  // No process ever ran on the directory: it can go at once.
  if (temporary) removeUserDataDir(userDataDir)
  fail(failure)
})
child.once('close', (code, signal) => {
  if (signal !== null) note(`the app was ended by ${signal}`)
  process.exitCode = wrongBuild ? 1 : (code ?? 1)
  if (child.pid === undefined) return
  const owner: LaunchOwner = {
    root: { pid: child.pid, spawnedAt, userDataDir },
    preexisting,
  }
  // Its helpers may still use the directory: it goes only once they are confirmed gone. They are
  // found by descent and process group, not by path: `pnpm run dev` runs the same Electron.
  void reapHelpers(owner, [], 3_000).then(
    killed => {
      if (killed.length > 0)
        note(`stopped lingering helpers: ${killed.map(entry => entry.pid).join(', ')}`)
      if (temporary) removeUserDataDir(userDataDir)
    },
    (failure: unknown) => {
      note(
        `cleanup failed: ${failure instanceof Error ? failure.message : String(failure)}; user data kept in ${userDataDir}`,
      )
      process.exitCode = 1
    },
  )
})
