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
  const { readinessTimeoutMs, shutdownDeadlineMs, stopAfterStartup, stop, ...rest } = options
  const stateRoot = realpathSync(mkdtempSync(join(tmpdir(), 'serve-fixture-')))
  const controller = new AbortController()
  const records: S0Record[] = []
  const stderr: string[] = []
  const signal = stop ?? controller.signal
  try {
    const result = await runServe({
      ...rest,
      stateRoot,
      readinessTimeoutMs: readinessTimeoutMs ?? 5000,
      shutdownDeadlineMs: shutdownDeadlineMs ?? 2000,
      stop: signal,
      write: record => {
        records.push(record)
        if (record.kind === 'startup-result' && stopAfterStartup !== false)
          controller.abort('test: startup seen')
      },
      stderr: line => stderr.push(line),
    })
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
    rmSync(stateRoot, { recursive: true, force: true })
  }
}
