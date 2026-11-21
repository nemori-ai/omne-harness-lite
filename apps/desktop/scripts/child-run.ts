// Watching one test launch started by a launcher (`pnpm run start:test`): its exit, the end of its
// output, and the helpers it leaves behind. Only processes the launch created are ever killed.
import { type ChildProcess, spawn } from 'node:child_process'
import type { Readable } from 'node:stream'
import { type LaunchSpec, verifyBuildProfile } from './launch.ts'
import { windowsProcess } from './powershell.ts'
import { deadline, listProcesses, sleep } from './release-launch.ts'
import { type LaunchRoot, launchProcesses, type ProcessInfo } from './release-processes.ts'

/** SIGKILLs `pid` (a negative one is a process group); false when it is already gone. */
export function killIfRunning(pid: number): boolean {
  try {
    return process.kill(pid, 'SIGKILL')
  } catch (failure) {
    if (!(failure instanceof Error && 'code' in failure && failure.code === 'ESRCH')) throw failure
    return false
  }
}

export type TestRun = Readonly<{
  /** Settles once the app has exited and its output has ended, or the drain grace ran out. */
  finished: Promise<number | null>
  /** Stops the run with `reason`: the app's whole group or tree is killed. */
  abort(reason: unknown): void
  /** After `finished`: kills and rechecks helpers that linger; throws when it cannot confirm them gone. */
  reap(): Promise<number[]>
}>

/** Waits for the app AND the end of its output. A helper inheriting a pipe gets a bounded grace period. */
export function monitorTestChild(
  child: ChildProcess & { stdout: Readable },
  spec: Pick<LaunchSpec, 'command' | 'processDir' | 'profile'>,
  spawnedAt: number,
  {
    userDataDir,
    preexisting = new Set<number>(),
    // A bounded cleanup grace period, not a measured upper limit for Electron to drain.
    drainMs = 3_000,
  }: Readonly<{ userDataDir?: string; preexisting?: ReadonlySet<number>; drainMs?: number }> = {},
): TestRun {
  const root: LaunchRoot = {
    pid: child.pid ?? 0,
    spawnedAt,
    ...(userDataDir === undefined ? {} : { userDataDir }),
  }
  const location = { command: spec.command, processDir: spec.processDir }
  let resolve!: (code: number | null) => void
  let reject!: (failure: unknown) => void
  const finished = new Promise<number | null>((done, fail) => {
    resolve = done
    reject = fail
  })
  let failure: Error | undefined
  let drain: ReturnType<typeof setTimeout> | undefined
  let closed = false
  let taskkill: ChildProcess | undefined
  const running = () =>
    child.pid !== undefined && child.exitCode === null && child.signalCode === null
  const warn = (what: string, cause: unknown) =>
    process.stderr.write(`${what}: ${cause instanceof Error ? cause.message : String(cause)}\n`)
  // child.kill uses the handle of the process actually spawned, even if Windows has reused its PID.
  const killRoot = () => {
    if (!running()) return
    try {
      child.kill('SIGKILL')
    } catch (cause) {
      warn("could not stop the app's main process", cause)
    }
  }
  const stopTree = () => {
    // Once the main process has exited, reap() checks the identity of each survivor.
    if (child.pid === undefined || !running()) return
    if (process.platform === 'win32') {
      if (taskkill !== undefined) return
      taskkill = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      })
      taskkill.on('error', killRoot)
      taskkill.once('exit', code => {
        if (code !== 0) killRoot()
      })
    } else if (!killIfRunning(-child.pid)) killRoot()
  }
  const stopTaskkill = () => {
    if (taskkill === undefined) return
    try {
      if (taskkill.exitCode === null && taskkill.signalCode === null) taskkill.kill()
    } catch (cause) {
      warn('could not stop taskkill', cause)
    } finally {
      taskkill.unref()
    }
  }
  const abort = (reason: unknown) => {
    if (failure !== undefined) return
    failure = reason instanceof Error ? reason : new Error(String(reason))
    if (closed) return
    clearTimeout(drain)
    // Neither a failed tree kill nor a child with undrainable pipes may make the caller wait for
    // exit or close forever. reap() separately checks that the main process and its helpers are gone.
    drain = setTimeout(() => {
      stopTaskkill()
      killRoot()
      child.stdin?.destroy()
      child.stdout.destroy()
      child.stderr?.destroy()
      child.unref()
      reject(failure)
    }, drainMs)
    try {
      stopTree()
    } catch (cause) {
      warn("could not terminate the app's processes", cause)
      killRoot()
    }
  }
  const profile = verifyBuildProfile(child.stdout, spec.profile).catch(abort)
  child.on('error', cause => {
    if (child.pid !== undefined) abort(cause)
    else failure ??= cause // An unsuccessful spawn still emits close.
  })
  child.once('exit', () => {
    root.exitedAt =
      /* wall-clock: observation-time -- compared with process start times the OS reports */ Date.now()
    if (failure === undefined && !closed)
      drain = setTimeout(() => {
        abort(new Error('the app exited but its helpers kept its output open'))
        child.stdout.destroy()
        child.stderr?.destroy()
      }, drainMs)
  })
  child.once('close', code => {
    closed = true
    clearTimeout(drain)
    stopTaskkill()
    void profile.then(() => (failure !== undefined ? reject(failure) : resolve(code)))
  })

  const owned = () =>
    launchProcesses(listProcesses(), root, preexisting, location, process.platform).filter(
      entry => entry.pid !== root.pid,
    )
  async function waitForHelpers(): Promise<ProcessInfo[]> {
    const expired = deadline(drainMs)
    let leftovers = owned()
    while ((leftovers.length > 0 || running()) && !expired()) {
      await sleep(100)
      leftovers = owned()
    }
    return leftovers
  }
  /** Reports forced stops separately from helpers that survived cleanup and invalidate the run. */
  async function reap(): Promise<number[]> {
    if (child.pid === undefined) return []
    const lingering = await waitForHelpers()
    if (lingering.length === 0 && !running()) return []
    const killed: number[] = []
    for (const entry of lingering) {
      if (process.platform === 'win32') {
        if (windowsProcess(entry, 'kill')) killed.push(entry.pid)
      } else {
        // Refresh the identity immediately before signalling; ps times are only precise to a second.
        const same = owned().some(
          other =>
            other.pid === entry.pid &&
            other.startedAt === entry.startedAt &&
            other.command === entry.command,
        )
        if (same && killIfRunning(entry.pid)) killed.push(entry.pid)
      }
    }
    // CIM can retain an exited process in its listing for seconds, even with no executable or command line.
    const remaining = (await waitForHelpers()).filter(
      entry => process.platform !== 'win32' || windowsProcess(entry, 'check'),
    )
    if (running()) throw new Error(`main process ${child.pid} is still running after cleanup`)
    if (remaining.length > 0)
      throw new Error(
        `helpers still running after cleanup: ${remaining.map(entry => entry.pid).join(', ')}`,
      )
    return killed
  }
  return { abort, finished, reap }
}
