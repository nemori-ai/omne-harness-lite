import type { Context, Fiber } from '@deepseek-ai/cordis'
import type { FiberStateName, RowId, RowManifest, RowState, ServiceName } from './types.ts'

type CordisFiberState = typeof import('@deepseek-ai/cordis').FiberState

/*
 * `FiberState` is a `declare const enum` in @deepseek-ai/cordis 4.0.4, so the
 * runtime cannot read it under `isolatedModules`. The numbers are copied here
 * and `satisfies` ties each one to the declared member. Both tables must cover
 * every member name, so a member added by a later Cordis fails the typecheck.
 */
const FIBER_VALUE = {
  PENDING: 0 satisfies CordisFiberState['PENDING'],
  LOADING: 1 satisfies CordisFiberState['LOADING'],
  ACTIVE: 2 satisfies CordisFiberState['ACTIVE'],
  FAILED: 3 satisfies CordisFiberState['FAILED'],
  DISPOSED: 4 satisfies CordisFiberState['DISPOSED'],
  UNLOADING: 5 satisfies CordisFiberState['UNLOADING'],
} as const satisfies Record<keyof CordisFiberState, number>

// UNLOADING has no name in the frozen FiberStateName. A fiber that is being
// removed is not usable, so it reads as DISPOSED.
const FIBER_NAME = {
  PENDING: 'PENDING',
  LOADING: 'LOADING',
  ACTIVE: 'ACTIVE',
  FAILED: 'FAILED',
  DISPOSED: 'DISPOSED',
  UNLOADING: 'DISPOSED',
} as const satisfies Record<keyof CordisFiberState, FiberStateName>

export function mapFiberState(raw: number): FiberStateName {
  for (const member of Object.keys(FIBER_VALUE) as Array<keyof CordisFiberState>) {
    if (FIBER_VALUE[member] === raw) return FIBER_NAME[member]
  }
  throw new Error(`unknown fiber state ${raw}`)
}

/** A loaded row: the fiber handle plus what the row declared. `error` is filled in when the fiber fails. */
export type LoadedRow = {
  readonly id: RowId
  readonly ctx: Context
  readonly fiber: Fiber
  readonly manifest: RowManifest
  readonly visible: readonly ServiceName[]
  error?: unknown
}

export type ReadinessOutcome = 'ready' | 'pending' | 'failed' | 'readiness-timeout'

export type ReadinessReport = Readonly<{
  outcome: ReadinessOutcome
  /** 0 ready; 3 at least one FAILED; 4 PENDING remains or LOADING did not finish. */
  exitCode: 0 | 3 | 4
  rows: readonly RowState[]
}>

const stateOf = (row: LoadedRow): FiberStateName => mapFiberState(row.fiber.state)

/** Await the current load work of a row. A rejection is the fiber's own startup error. */
function observe(row: LoadedRow): Promise<void> {
  return row.fiber.await().then(
    () => undefined,
    (error: unknown) => {
      row.error = error
    },
  )
}

/** Wait until no row is LOADING. Returns true when the deadline passed first. */
async function settle(rows: readonly LoadedRow[], timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<'deadline'>(resolve => {
    timer = setTimeout(() => resolve('deadline'), timeoutMs)
  })
  try {
    for (;;) {
      const loading = rows.filter(row => stateOf(row) === 'LOADING')
      if (loading.length === 0) return false
      const won = await Promise.race([Promise.all(loading.map(observe)), deadline])
      if (won === 'deadline') return true
    }
  } finally {
    clearTimeout(timer)
  }
}

function errorInfo(error: unknown): NonNullable<RowState['error']> {
  if (error instanceof Error) {
    const tag = (error as { tag?: unknown }).tag
    return { tag: typeof tag === 'string' ? tag : error.name, message: error.message }
  }
  return { tag: 'unknown', message: String(error) }
}

/**
 * A name is missing when the row's own context finds no ACTIVE provider for it.
 * A provider row that exists but is not ACTIVE blocks the row, and a provider
 * under another label (it does not see the name the way this row does) does not.
 */
function pendingReasons(
  row: LoadedRow,
  all: readonly LoadedRow[],
): { missing: ServiceName[]; blockedBy: RowId[] } {
  const missing: ServiceName[] = []
  const blockedBy: RowId[] = []
  for (const name of row.manifest.injects) {
    if (row.ctx.reflect.get(name) !== undefined) continue
    missing.push(name)
    for (const other of all) {
      if (other === row || blockedBy.includes(other.id)) continue
      if (!other.manifest.provides.includes(name)) continue
      if (other.visible.includes(name) !== row.visible.includes(name)) continue
      if (stateOf(other) !== 'ACTIVE') blockedBy.push(other.id)
    }
  }
  return { missing, blockedBy }
}

function describeRow(row: LoadedRow, all: readonly LoadedRow[]): RowState {
  const state = stateOf(row)
  const { missing, blockedBy } =
    state === 'PENDING' ? pendingReasons(row, all) : { missing: [], blockedBy: [] }
  const error = state === 'FAILED' ? errorInfo(row.error) : null
  return { id: row.id, state, missing, blockedBy, error }
}

function outcomeOf(rows: readonly RowState[], timedOut: boolean): ReadinessOutcome {
  const states = rows.map(row => row.state)
  if (states.some(s => s === 'FAILED' || s === 'DISPOSED')) return 'failed'
  if (timedOut && states.includes('LOADING')) return 'readiness-timeout'
  if (states.some(s => s !== 'ACTIVE')) return 'pending'
  return 'ready'
}

const EXIT_CODE = {
  ready: 0,
  failed: 3,
  pending: 4,
  'readiness-timeout': 4,
} as const satisfies Record<ReadinessOutcome, 0 | 3 | 4>

/**
 * Wait for the loaded rows to settle, report every row, and call the barrier
 * once only when every row is ACTIVE. A timeout never turns PENDING into FAILED.
 */
export async function awaitReadiness(options: {
  rows: readonly LoadedRow[]
  timeoutMs: number
  barrier: () => void | Promise<void>
}): Promise<ReadinessReport> {
  const { rows } = options
  const timedOut = await settle(rows, options.timeoutMs)
  await Promise.all(
    rows.filter(row => stateOf(row) === 'FAILED' && row.error === undefined).map(observe),
  )
  const states = rows.map(row => describeRow(row, rows))
  const outcome = outcomeOf(states, timedOut)
  if (outcome === 'ready') await options.barrier()
  return { outcome, exitCode: EXIT_CODE[outcome], rows: states }
}
