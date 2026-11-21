// Closing a launched app and confirming that what it owns is gone, apart from the Playwright fixtures.
import type { ChildProcess } from 'node:child_process'
import type { ElectronApplication } from '@playwright/test'
import { windowsProcess } from '../scripts/powershell.ts'
import { listProcesses } from '../scripts/release-launch.ts'

export type MainProcess = Readonly<{ pid: number; startedAt?: number }>

const pause = (ms: number) => new Promise(done => setTimeout(done, ms))

/**
 * Closes the app and waits for what it owns: the original child handle, which can be a launcher on
 * Windows, the pinned main process there, and the process group it led when it had to be killed.
 */
export async function closeApplication(
  app: Pick<ElectronApplication, 'close'>,
  launcher: Pick<ChildProcess, 'pid' | 'exitCode' | 'signalCode' | 'kill'>,
  main?: MainProcess,
  onExitUnconfirmed?: () => void,
): Promise<void> {
  const separateMain =
    process.platform === 'win32' && main && main.pid !== launcher.pid ? main : undefined
  const launcherRunning = () => launcher.exitCode === null && launcher.signalCode === null
  const mainRunning = (timeout: number) => {
    if (separateMain?.startedAt === undefined) return false
    try {
      process.kill(separateMain.pid, 0)
    } catch (failure) {
      if ((failure as { code?: unknown }).code === 'ESRCH') return false
      throw failure
    }
    return windowsProcess(separateMain, 'check', timeout)
  }
  let forcedGroup: number | undefined
  const groupRunning = () =>
    forcedGroup !== undefined &&
    listProcesses().some(entry => entry.zombie !== true && entry.pgid === forcedGroup)
  const now = () =>
    /* wall-clock: operation-timing -- bounds the wait for an exit */ performance.now()
  // One budget per phase: the polite close and its wait share theirs, as do the kill and its wait.
  const waitForExit = async (until: number) => {
    while (launcherRunning() || mainRunning(Math.max(1, until - now())) || groupRunning()) {
      if (now() >= until) throw new Error('the owned process did not exit before the deadline')
      await pause(50)
    }
  }
  const until = now() + 10_000
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    if (!launcherRunning() && !mainRunning(10_000)) return
    await Promise.race([
      app.close(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('the app did not close within 10 seconds')),
          10_000,
        )
      }),
    ])
    await waitForExit(until)
  } catch (failure) {
    const killUntil = now() + 5_000
    try {
      try {
        if (separateMain) windowsProcess(separateMain, 'kill', 5_000)
        // Playwright starts Electron as the leader of its own POSIX process group.
        const pid = launcher.pid
        if (
          process.platform !== 'win32' &&
          launcherRunning() &&
          pid !== undefined &&
          listProcesses().some(
            entry => entry.pid === pid && entry.pgid === pid && entry.zombie !== true,
          )
        ) {
          forcedGroup = pid
          process.kill(-pid, 'SIGKILL')
        }
      } finally {
        if (launcherRunning()) launcher.kill('SIGKILL')
      }
    } catch (killFailure) {
      process.stderr.write(`e2e: could not stop the owned process: ${String(killFailure)}\n`)
    }
    try {
      await waitForExit(killUntil)
    } catch (waitFailure) {
      process.stderr.write(`e2e: could not confirm the exit: ${String(waitFailure)}\n`)
      onExitUnconfirmed?.()
    }
    throw failure
  } finally {
    clearTimeout(timer)
  }
}
