// pnpm run window [--packaged | --app <executable>] [--user-data-dir=<dir>] [Electron arguments]
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
import { forwardSignals } from './signals.ts'

const note = (line: string) => process.stderr.write(`window: ${line}\n`)
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
    : freshUserDataDir('window')
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
child.once('error', failure => fail(failure))
child.once('close', (code, signal) => {
  if (signal !== null) note(`the app was ended by ${signal}`)
  process.exitCode = wrongBuild ? 1 : (code ?? 1)
  if (temporary) removeUserDataDir(userDataDir)
})
