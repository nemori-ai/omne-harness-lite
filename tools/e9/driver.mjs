import { spawn, spawnSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { validateRounds } from './metrics.mjs'
import { captureTree, observeTree } from './posix-tree.mjs'

export async function killTree(child, tree) {
  if (child.pid === undefined) return
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      timeout: 10000,
      encoding: 'utf8',
      windowsHide: true,
    })
    return {
      exitCode: result.status,
      state: result.status === 0 && !result.error ? 'taskkill-result' : 'incomplete',
      error: result.error?.message,
    }
  }
  return (tree ?? observeTree(child.pid)).cleanup()
}

export function launchProcess(command, args, options = {}) {
  const started = performance.now()
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', ...options.env },
    windowsHide: true,
    detached: process.platform !== 'win32',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const tree =
    process.platform !== 'win32' && child.pid !== undefined ? captureTree(child.pid) : undefined
  const done = new Promise(resolve => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let cancelled = false
    let cleanup
    let cleaning
    let closingTimer
    let settled = false
    const stop = () => {
      cleaning ??= killTree(child, tree).then(result => {
        cleanup = result
      })
      closingTimer ??= setTimeout(() => {
        child.stdout.destroy()
        child.stderr.destroy()
        child.stdin.destroy()
        child.unref()
        void finish(child.exitCode, child.signalCode, false)
      }, 15000)
      return cleaning
    }
    const cancel = () => {
      cancelled = true
      void stop()
    }
    process.once('SIGINT', cancel)
    process.once('SIGTERM', cancel)
    const deadline = started + (options.timeoutMs ?? 30000)
    let timer
    const arm = () => {
      const remaining = deadline - performance.now()
      timer = setTimeout(
        () => {
          if (performance.now() < deadline) arm()
          else {
            timedOut = true
            void stop()
          }
        },
        Math.min(2147483647, Math.max(1, remaining)),
      )
    }
    arm()
    child.stdout.setEncoding('utf8').on('data', bytes => {
      stdout += bytes
      options.onOutput?.(stdout, child)
    })
    child.stderr.setEncoding('utf8').on('data', bytes => {
      stderr += bytes
    })
    child.on('error', error => {
      stderr += error.message
    })
    async function finish(code, signal, closed = true) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearTimeout(closingTimer)
      process.removeListener('SIGINT', cancel)
      process.removeListener('SIGTERM', cancel)
      await cleaning
      resolve({
        command,
        args,
        exitCode: code ?? -1,
        signal: signal ?? 'none',
        timedOut,
        cancelled,
        closed,
        ...(cleanup ? { cleanup } : {}),
        stdout,
        stderr,
        elapsedMs: performance.now() - started,
      })
    }
    child.on('close', (code, signal) => {
      void finish(code, signal)
    })
    child.stdin.on('error', () => {})
    if (options.closeStdin !== false) child.stdin.end(options.input ?? '')
  })
  return { child, done }
}

export async function runProcess(command, args, options = {}) {
  return launchProcess(command, args, options).done
}

/** limit：适配器声明的计划轮数，1～200 的整数，缺省 200。短跑只能少跑，不能多跑。 */
export async function driveRounds(next, onRound = () => {}, limit = 200) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200)
    throw new RangeError('planned rounds must be an integer from 1 to 200')
  const rounds = []
  for (let number = 1; number <= limit; number++) {
    const row = await next(number)
    rounds.push(row)
    validateRounds(rounds)
    await onRound(row)
    if (row.logEntries >= 10000) break
  }
  return rounds
}
