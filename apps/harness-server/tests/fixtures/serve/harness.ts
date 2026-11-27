import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  runServe,
  type RunServeOptions,
  type S0Record,
  type ServeResult,
} from '../../../src/run.ts'

export type ServeOnceOptions = Omit<
  RunServeOptions,
  'write' | 'stderr' | 'stop' | 'stateRoot' | 'readinessTimeoutMs' | 'shutdownDeadlineMs'
> &
  Readonly<{
    readinessTimeoutMs?: number
    shutdownDeadlineMs?: number
    stopAfterStartup?: boolean
    stop?: AbortSignal
    /** Runs while the process serves, once its control port is open; the run stops when it settles. */
    serving?: (at: Readonly<{ stateRoot: string }>) => Promise<void>
  }>

export type ServeRun = Readonly<{
  result: ServeResult
  records: readonly S0Record[]
  stderr: readonly string[]
  of(kind: string): S0Record[]
  startup: S0Record
  tree(id: string): S0Record | undefined
  state(id: string): S0Record | undefined
}>

export async function serveOnce(options: ServeOnceOptions): Promise<ServeRun> {
  const { readinessTimeoutMs, shutdownDeadlineMs, stopAfterStartup, stop, serving, ...rest } =
    options
  let served: Promise<void> | undefined
  const stateRoot = realpathSync(mkdtempSync(join(tmpdir(), 'serve-fixture-')))
  const controller = new AbortController()
  const records: S0Record[] = []
  const stderr: string[] = []
  // A stop the caller asks while the tree still starts is passed on once the startup result is written: a run of this
  // fixture starts whole and then stops. A stop while the rows load is tested on `startTree` and on the process.
  let startupSeen = false
  const pass = () => controller.abort(stop?.reason ?? 'test: stop')
  const onStop = () => startupSeen && pass()
  stop?.addEventListener('abort', onStop, { once: true })
  try {
    const result = await runServe({
      ...rest,
      stateRoot,
      readinessTimeoutMs: readinessTimeoutMs ?? 5000,
      shutdownDeadlineMs: shutdownDeadlineMs ?? 2000,
      stop: controller.signal,
      write: record => {
        records.push(record)
        if (record.kind === 'control-port' && serving !== undefined)
          served = serving({ stateRoot }).finally(pass)
        if (record.kind !== 'startup-result') return
        startupSeen = true
        if (stop?.aborted === true) pass()
        else if (stop === undefined && stopAfterStartup !== false && serving === undefined)
          controller.abort('test: startup seen')
      },
      stderr: line => stderr.push(line),
    })
    await served
    const of = (kind: string) => records.filter(record => record.kind === kind)
    const byId = (kind: string, id: string) => of(kind).find(record => record['id'] === id)
    return {
      result,
      records,
      stderr,
      of,
      startup: of('startup-result')[0] ?? { kind: 'absent' },
      tree: id => byId('tree', id),
      state: id => byId('row-state', id),
    }
  } finally {
    stop?.removeEventListener('abort', onStop)
    rmSync(stateRoot, { recursive: true, force: true })
  }
}
