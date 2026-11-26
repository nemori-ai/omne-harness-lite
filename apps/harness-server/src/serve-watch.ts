import type { Context } from '@deepseek-ai/cordis'
import { openControl, type ControlPort } from './control-port.ts'
import type { LoadedRow } from './readiness.ts'
import type { RowSupervision } from './shutdown.ts'
import { createSwapper, type SwapInput } from './swap.ts'

type Record = { readonly kind: string } & Readonly<{ [key: string]: unknown }>

export type ServeWatch = Readonly<{
  registry: RowSupervision
  root: Context
  loaded: readonly LoadedRow[]
  undeclared: readonly string[]
  stop: AbortSignal
  dependencyDeadlineMs: number
  startDeadlineMs: number
  write: (record: Record) => void
  stderr: (line: string) => void
  /** Where the control port of this run is opened, and what a swap needs of the tree. */
  control?: Readonly<{ stateRoot: string }> & Pick<SwapInput, 'rows' | 'trust' | 'applied' | 'wrap'>
}>

export type Leaving = Readonly<{ code: 0 | 3 | 4; reason: string; row: string }>

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

/** A run that cannot open its control port serves all the same: it only cannot be told to swap. */
async function controlOf(
  input: ServeWatch,
  hooks: Pick<SwapInput, 'swapped' | 'mismatched'>,
): Promise<ControlPort | undefined> {
  const { control, write, stderr } = input
  if (control === undefined) return undefined
  const { stateRoot, ...tree } = control
  const swapper = createSwapper({ ...tree, loaded: input.loaded, write, ...hooks })
  try {
    const port = await openControl(stateRoot, swapper)
    // The record does not carry the path: it is the state directory, which stays off the output.
    write({ kind: 'control-port', open: true })
    return port
  } catch (error) {
    stderr(
      `serve: the control port is not open: ${error instanceof Error ? error.message : String(error)}`,
    )
    return undefined
  }
}

/** Serves until someone asks it to stop or the supervision of the rows says the process is to leave. */
export async function serveUntilStop(input: ServeWatch): Promise<Leaving | undefined> {
  const { registry, write, stderr } = input
  if (input.undeclared.length > 0)
    write({ kind: 'row-edges', undeclared: input.undeclared.toSorted() })
  const leaving = Promise.withResolvers<Leaving>()
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
  const control = await controlOf(input, {
    swapped: (row, fiber) => {
      Object.assign(row, { fiber })
      unwatch.replace(row.id, fiber)
    },
    mismatched: row => leaving.resolve({ code: 0, reason: 'swap-mismatch', row }),
  })
  const request = stopRequest(input.stop)
  const won = await Promise.race([request.promise, leaving.promise])
  request.cancel()
  unwatch.stop()
  await control?.close()
  if (typeof won === 'string') {
    stderr(`serve: stop requested: ${won}`)
    return undefined
  }
  write({ kind: 'supervision-exit', row: won.row, reason: won.reason, code: won.code })
  stderr(`serve: row ${won.row}: ${won.reason}; the process leaves`)
  return won
}
