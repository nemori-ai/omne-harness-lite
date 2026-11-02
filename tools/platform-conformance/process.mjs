import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { enterStage, withoutDeadlineChannel } from './deadlines.mjs'

export function pnpmCommand(args) {
  if (process.platform !== 'win32') return ['pnpm', ...args]
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    if (existsSync(join(directory, 'pnpm.exe'))) return [join(directory, 'pnpm.exe'), ...args]
    const entry = join(directory, 'node_modules/pnpm/bin/pnpm.cjs')
    if (existsSync(join(directory, 'pnpm.cmd')) && existsSync(entry))
      return [process.execPath, entry, ...args]
  }
  throw new Error('Cannot resolve pnpm.exe or pnpm.cmd with pnpm.cjs on PATH')
}

function killTree(child) {
  if (!child.pid) return
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      timeout: 10_000,
      windowsHide: true,
      stdio: 'ignore',
    })
  } else {
    const listing = spawnSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8', timeout: 5000 })
    const rows = (listing.stdout ?? '')
      .trim()
      .split('\n')
      .map(line => line.trim().split(/\s+/).map(Number))
    const descendants = pid =>
      rows.filter(row => row[1] === pid).flatMap(row => [...descendants(row[0]), row[0]])
    for (const pid of [...descendants(child.pid), -child.pid]) {
      try {
        process.kill(pid, 'SIGKILL')
      } catch (error) {
        if (error.code !== 'ESRCH') throw error
      }
    }
  }
}

export async function execute(
  argv,
  { cwd, timeoutMs = 900_000, signal, stdout, stderr, env = {}, deadline } = {},
) {
  const startedAt = new Date().toISOString()
  if (signal?.aborted)
    return { code: null, interrupted: 'cancelled', startedAt, stdout: '', stderr: '' }
  enterStage('subprocess', timeoutMs)
  return new Promise(resolve => {
    let output = ''
    let errors = ''
    let interrupted = null
    let spawnError = null
    let deadlineExceeded = null
    let deadlineError = null
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      env: { ...process.env, ...withoutDeadlineChannel, NO_COLOR: '1', FORCE_COLOR: '0', ...env },
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout.on('data', chunk => {
      output += chunk
      stdout?.(chunk)
    })
    child.stderr.on('data', chunk => {
      errors += chunk
      stderr?.(chunk)
    })
    child.once('error', error => {
      spawnError = error.message
    })
    const stop = reason => {
      if (interrupted) return
      interrupted = reason
      killTree(child)
    }
    const cancel = () => stop('cancelled')
    signal?.addEventListener('abort', cancel, { once: true })
    let timer
    const started = performance.now()
    const checkDeadline = () => {
      let current
      try {
        current = deadline?.() ?? {
          phase: 'subprocess',
          startedAt,
          timeoutMs,
          remainingMs: timeoutMs - (performance.now() - started),
        }
      } catch (error) {
        deadlineError = error.message
        stop('deadline-unavailable')
        return
      }
      if (current.remainingMs <= 0) {
        deadlineExceeded = current
        stop('timeout')
      } else
        timer = setTimeout(
          checkDeadline,
          Math.min(current.remainingMs, deadline ? 100 : 2_147_483_647),
        )
    }
    checkDeadline()
    child.once('close', (code, childSignal) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', cancel)
      enterStage('runner')
      resolve({
        code,
        signal: childSignal,
        interrupted,
        spawnError,
        ...(deadlineExceeded ? { deadline: deadlineExceeded } : {}),
        ...(deadlineError ? { deadlineError } : {}),
        startedAt,
        finishedAt: new Date().toISOString(),
        stdout: output,
        stderr: errors,
      })
    })
    if (signal?.aborted) cancel()
  })
}
