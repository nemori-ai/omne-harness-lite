import type { Context } from '@deepseek-ai/cordis'
import type { SupervisedExit } from '@omne-harness/assembly-cordis/cordis'
import type { LoadedRow } from './readiness.ts'
import type { RowSupervision } from './shutdown.ts'

type Record = { readonly kind: string } & Readonly<{ [key: string]: unknown }>

export type ServeWatch = Readonly<{
  registry: RowSupervision
  root: Context
  loaded: readonly LoadedRow[]
  /** `consumer>provider` for every edge the live tree has and no manifest declares. */
  undeclared: readonly string[]
  stop: AbortSignal
  dependencyDeadlineMs: number
  startDeadlineMs: number
  write: (record: Record) => void
  stderr: (line: string) => void
}>

function stopRequest(signal: AbortSignal): { promise: Promise<string>; cancel: () => void } {
  const reasonOf = () => (typeof signal.reason === 'string' ? signal.reason : 'stop signal')
  let onAbort = () => {}
  const promise = new Promise<string>(resolve => {
    if (signal.aborted) {
      resolve(reasonOf())
      return
    }
    onAbort = () => resolve(reasonOf())
    signal.addEventListener('abort', onAbort, { once: true })
  })
  return { promise, cancel: () => signal.removeEventListener('abort', onAbort) }
}

/** Serves until someone asks it to stop or the supervision of the rows says the process is to leave. */
export async function serveUntilStop(input: ServeWatch): Promise<SupervisedExit | undefined> {
  const { registry, write, stderr } = input
  if (input.undeclared.length > 0)
    write({ kind: 'row-edges', undeclared: input.undeclared.toSorted() })
  const leaving = Promise.withResolvers<SupervisedExit>()
  const unwatch = registry.watch(
    input.root,
    input.loaded.map(row => ({ id: row.id, fiber: row.fiber, swap: 'restart' as const })),
    {
      dependencyDeadlineMs: input.dependencyDeadlineMs,
      startDeadlineMs: input.startDeadlineMs,
      moved: (row, standing) => write({ kind: 'row-supervision', row, standing }),
      exit: leaving.resolve,
    },
  )
  const request = stopRequest(input.stop)
  const won = await Promise.race([request.promise, leaving.promise])
  request.cancel()
  unwatch()
  if (typeof won === 'string') {
    stderr(`serve: stop requested: ${won}`)
    return undefined
  }
  write({ kind: 'supervision-exit', row: won.row, reason: won.reason, code: won.code })
  stderr(`serve: row ${won.row}: ${won.reason}; the process leaves`)
  return won
}
