import { spawn, spawnSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { validateRounds } from './metrics.mjs'

export function killTree(child) {
  if (child.pid === undefined) return
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      timeout: 10000,
      encoding: 'utf8',
      windowsHide: true,
    })
    return { exitCode: result.status, error: result.error?.message }
  }
  try {
    process.kill(-child.pid, 'SIGKILL')
    return { exitCode: 0 }
  } catch (error) {
    return { exitCode: 1, error: error.message }
  }
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
  const done = new Promise(resolve => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let cancelled = false
    let cleanup
    const cancel = () => {
      cancelled = true
      cleanup = killTree(child)
    }
    process.once('SIGINT', cancel)
    process.once('SIGTERM', cancel)
    const timer = setTimeout(() => {
      timedOut = true
      cleanup = killTree(child)
    }, options.timeoutMs ?? 30000)
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
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      process.removeListener('SIGINT', cancel)
      process.removeListener('SIGTERM', cancel)
      resolve({
        command,
        args,
        exitCode: code ?? -1,
        signal: signal ?? 'none',
        timedOut,
        cancelled,
        ...(cleanup ? { cleanup } : {}),
        stdout,
        stderr,
        elapsedMs: performance.now() - started,
      })
    })
    child.stdin.on('error', () => {})
    if (options.closeStdin !== false) child.stdin.end(options.input ?? '')
  })
  return { child, done }
}

export async function runProcess(command, args, options = {}) {
  return launchProcess(command, args, options).done
}

export async function driveRounds(next, onRound = () => {}) {
  const rounds = []
  for (let number = 1; number <= 200; number++) {
    const row = await next(number)
    rounds.push(row)
    validateRounds(rounds)
    await onRound(row)
    if (row.logEntries >= 10000) break
  }
  return rounds
}
