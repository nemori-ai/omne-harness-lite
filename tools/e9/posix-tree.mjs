import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { performance } from 'node:perf_hooks'

export function processSnapshot(deadline) {
  if (process.platform === 'linux') {
    const rows = []
    for (const name of readdirSync('/proc')) {
      if (performance.now() >= deadline) throw new Error('process discovery deadline exceeded')
      if (!/^\d+$/.test(name)) continue
      try {
        const stat = readFileSync(`/proc/${name}/stat`, 'utf8')
        const fields = stat.slice(stat.lastIndexOf(') ') + 2).split(' ')
        rows.push({
          pid: Number(name),
          parent: Number(fields[1]),
          state: fields[0],
          identity: fields[19],
        })
      } catch (error) {
        if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error
      }
    }
    return rows
  }
  const result = spawnSync('ps', ['-axo', 'pid=,ppid=,stat=,lstart='], {
    encoding: 'utf8',
    timeout: Math.max(1, Math.ceil(Math.min(1000, deadline - performance.now()))),
    env: { ...process.env, LC_ALL: 'C' },
  })
  if (result.error || result.status !== 0)
    throw new Error(result.error?.message ?? `ps exited ${result.status}`)
  return result.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const match = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/.exec(line)
      if (!match) throw new Error('unrecognized ps process record')
      return {
        pid: Number(match[1]),
        parent: Number(match[2]),
        state: match[3],
        identity: match[4],
      }
    })
}

const stopped = row => !row || /^[ZX]/.test(row.state)

export function observeTree(
  pid,
  {
    snapshot = processSnapshot,
    signal = process.kill,
    pause = sleep,
    deadlineMs = 2000,
    maxProcesses = 256,
    maxErrors = 32,
  } = {},
) {
  const known = new Map()
  const errors = []
  let omittedErrors = 0
  let initialized = false
  let deadline
  function failure(error) {
    if (errors.length < maxErrors) errors.push(error)
    else omittedErrors++
  }
  function collect() {
    if (performance.now() >= deadline) throw new Error('process cleanup deadline exceeded')
    const rows = snapshot(deadline)
    const live = new Map(rows.map(row => [row.pid, row]))
    if (!initialized) {
      const root = live.get(pid)
      if (root) known.set(pid, root)
      else
        failure({ operation: 'discover', error: 'root unavailable; descendant ownership unknown' })
      initialized = true
    }
    let added
    do {
      added = false
      for (const row of rows) {
        const parent = known.get(row.parent)
        if (!known.has(row.pid) && parent && live.get(parent.pid)?.identity === parent.identity) {
          if (known.size >= maxProcesses) {
            failure({ operation: 'discover', error: 'process discovery limit exceeded' })
            continue
          }
          known.set(row.pid, row)
          added = true
        }
      }
    } while (added)
    return live
  }
  function send(row, name, live) {
    if (live.get(row.pid)?.identity !== row.identity || stopped(live.get(row.pid))) return
    try {
      signal(row.pid, name)
    } catch (error) {
      if (error.code !== 'ESRCH') failure({ operation: name, pid: row.pid, error: error.message })
    }
  }
  async function cleanup() {
    const started = performance.now()
    deadline = started + deadlineMs
    let live
    try {
      // Freeze discovered parents before the final traversal so they cannot add more children.
      let count
      do {
        live = collect()
        count = known.size
        for (const row of known.values()) send(row, 'SIGSTOP', collect())
        live = collect()
      } while (known.size !== count && performance.now() - started < deadlineMs)
      for (const row of [...known.values()].reverse()) send(row, 'SIGKILL', collect())
      do {
        live = collect()
        if (
          [...known.values()].every(
            row => live.get(row.pid)?.identity !== row.identity || stopped(live.get(row.pid)),
          )
        )
          break
        await pause(20)
      } while (performance.now() - started < deadlineMs)
    } catch (error) {
      failure({ operation: 'cleanup', error: error.message })
    }
    const processes = [...known.values()].map(row => {
      const current = live?.get(row.pid)
      return {
        pid: row.pid,
        identity: row.identity,
        state: !live
          ? 'unknown'
          : !current || current.identity !== row.identity
            ? 'exited'
            : /^[ZX]/.test(current.state)
              ? 'zombie'
              : 'running',
      }
    })
    const complete =
      errors.length === 0 && processes.every(row => ['exited', 'zombie'].includes(row.state))
    return {
      exitCode: complete ? 0 : 1,
      state: complete ? 'observed-stopped' : 'incomplete',
      scope: 'observed-descendants',
      unobservedDescendants: 'unknown',
      processes,
      errors,
      omittedErrors,
      limits: { deadlineMs, maxProcesses, maxErrors },
    }
  }
  return { cleanup }
}
