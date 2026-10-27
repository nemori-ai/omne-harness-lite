import { fork, type ChildProcess } from 'node:child_process'
import { InputError } from './protocol.ts'

export type ReadProbe = 'reconcile' | 'runs' | 'deadline'

/** One persistent read-only process per probe keeps remote REST outside the local health loop. */
export function createReadWorkers(module: URL, input: unknown, timeoutMs = 120_000) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1)
    throw new InputError('reduce-worker-timeout-invalid')
  type Pending = {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }
  type Worker = {
    child: ChildProcess
    pending: Pending | undefined
    terminal: boolean
    closed: Promise<void>
  }
  const workers = new Map<ReadProbe, Worker>()
  let stopped = false

  function fail(worker: Worker, reason: string) {
    if (worker.terminal) return
    worker.terminal = true
    if (worker.pending !== undefined) {
      clearTimeout(worker.pending.timer)
      worker.pending.reject(new InputError(reason))
      worker.pending = undefined
    }
    if (process.platform !== 'win32' && worker.child.pid !== undefined) {
      try {
        process.kill(-worker.child.pid, 'SIGKILL')
      } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH')
          worker.child.kill('SIGKILL')
      }
    } else worker.child.kill('SIGKILL')
  }

  function start(kind: ReadProbe): Worker {
    const child = fork(module, [], {
      execArgv: ['--experimental-strip-types'],
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      detached: process.platform !== 'win32',
    })
    // Diagnostics are not protocol data and can contain untrusted remote prose.
    child.stderr?.resume()
    const closed = new Promise<void>(resolve => child.once('close', () => resolve()))
    const worker: Worker = { child, pending: undefined, terminal: false, closed }
    child.on('error', () => fail(worker, 'reduce-worker-start-failed'))
    child.on('exit', () => fail(worker, 'reduce-worker-exited'))
    child.on('message', value => {
      if (worker.pending === undefined || worker.terminal) return
      if (typeof value !== 'object' || value === null || !('kind' in value)) {
        fail(worker, 'reduce-worker-protocol-invalid')
        return
      }
      if (value.kind !== kind || !('ok' in value)) {
        fail(worker, 'reduce-worker-probe-mismatch')
        return
      }
      const pending = worker.pending
      clearTimeout(pending.timer)
      worker.pending = undefined
      if (value.ok === true && 'signals' in value) pending.resolve(value.signals)
      else {
        pending.reject(new InputError('reduce-worker-probe-failed'))
        fail(worker, 'reduce-worker-probe-failed')
      }
    })
    workers.set(kind, worker)
    return worker
  }

  function stop(): void {
    stopped = true
    for (const worker of workers.values()) fail(worker, 'reduce-worker-stopped')
  }

  return {
    probe(kind: ReadProbe): Promise<unknown> {
      if (stopped) return Promise.reject(new InputError('reduce-worker-stopped'))
      const worker = workers.get(kind) ?? start(kind)
      if (worker.terminal) return Promise.reject(new InputError('reduce-worker-recovery-required'))
      if (worker.pending !== undefined)
        return Promise.reject(new InputError('reduce-worker-probe-overlap'))
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => fail(worker, 'reduce-worker-probe-timeout'), timeoutMs)
        worker.pending = { resolve, reject, timer }
        worker.child.send({ kind, input }, error => {
          if (error !== null) fail(worker, 'reduce-worker-send-failed')
        })
      })
    },
    stop,
    async close(): Promise<void> {
      stop()
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          Promise.all([...workers.values()].map(worker => worker.closed)),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new InputError('reduce-worker-cleanup-timeout')), 5000)
          }),
        ])
      } finally {
        if (timer !== undefined) clearTimeout(timer)
      }
    },
  }
}
