// pnpm run start [Electron arguments]: the packaged release app in out/release, as a person starts it.
// It adds nothing: no test switches, no temporary user data, no build profile check. It uses the
// installed app's user data and the system credential store, and never falls back to a bare Electron.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { constants } from 'node:os'
import { dirname } from 'node:path'
import { PACKAGE_COMMANDS } from './build-profile.ts'
import { linuxSandboxBlocker } from './launch.ts'
import { packagedBinary } from './packaged-path.ts'

// Ctrl+C in the terminal reaches the app as well, in the same foreground group: it quits by itself.
function waitForApp() {}

/** Starts the release app with exactly `args`; resolves with its exit status, 128 + n for a signal. */
export async function startRelease(args: readonly string[]): Promise<number> {
  const executable = packagedBinary('release')
  if (!existsSync(executable))
    throw new Error(`${executable} is missing: run \`${PACKAGE_COMMANDS.release}\` first`)
  if (process.platform === 'linux') {
    // The release app starts sandboxed or not at all, whatever switches it is given.
    const blocker = linuxSandboxBlocker(executable)
    if (blocker !== undefined) throw new Error(blocker)
  }
  const child = spawn(executable, [...args], { cwd: dirname(executable), stdio: 'inherit' })
  const forward = (signal: NodeJS.Signals) => {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal)
  }
  const posix = process.platform !== 'win32'
  if (posix) {
    process.on('SIGINT', waitForApp)
    process.on('SIGTERM', forward)
    process.on('SIGHUP', forward)
  }
  try {
    return await new Promise<number>((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code, signal) =>
        resolve(code ?? (posix && signal !== null ? 128 + constants.signals[signal] : 1)),
      )
    })
  } finally {
    if (posix) {
      process.off('SIGINT', waitForApp)
      process.off('SIGTERM', forward)
      process.off('SIGHUP', forward)
    }
  }
}

if (import.meta.main)
  try {
    process.exitCode = await startRelease(process.argv.slice(2))
  } catch (failure) {
    process.stderr.write(`start: ${failure instanceof Error ? failure.message : String(failure)}\n`)
    process.exitCode = 1
  }
