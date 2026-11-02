import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { performance } from 'node:perf_hooks'

export function processSnapshot() {
  if (process.platform === 'linux') {
    const rows = []
    for (const name of readdirSync('/proc')) {
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
    timeout: 1000,
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
  { snapshot = processSnapshot, signal = process.kill, pause = sleep, deadlineMs = 2000 } = {},
) {
  const known = new Map()
  const errors = []
  let initialized = false
  function collect() {
    const rows = snapshot()
    const live = new Map(rows.map(row => [row.pid, row]))
    if (!initialized) {
      const root = live.get(pid)
      if (root) known.set(pid, root)
      initialized = true
    }
    let added
    do {
      added = false
      for (const row of rows) {
        const parent = known.get(row.parent)
        if (!known.has(row.pid) && parent && live.get(parent.pid)?.identity === parent.identity) {
          known.set(row.pid, row)
          added = true
        }
      }
    } while (added)
    return live
  }
  function sample() {
    try {
      collect()
    } catch (error) {
      errors.push({ operation: 'discover', error: error.message })
    }
  }
  sample()
  const timer = setInterval(sample, 100)
  timer.unref()
  function send(row, name, live) {
    if (live.get(row.pid)?.identity !== row.identity || stopped(live.get(row.pid))) return
    try {
      signal(row.pid, name)
    } catch (error) {
      if (error.code !== 'ESRCH')
        errors.push({ operation: name, pid: row.pid, error: error.message })
    }
  }
  async function cleanup() {
    clearInterval(timer)
    const started = performance.now()
    let live
    try {
      // Freeze discovered parents before the final traversal so they cannot add more children.
      let count
      do {
        live = collect()
        count = known.size
        for (const row of known.values()) send(row, 'SIGSTOP', live)
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
      errors.push({ operation: 'cleanup', error: error.message })
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
      processes,
      errors,
    }
  }
  return { cleanup, dispose: () => clearInterval(timer) }
}
