import { edgesOf, stopsAfter } from '@omne-harness/assembly'
import type {
  HandleEntry,
  RowSupervisor,
  WithdrawnEntry,
} from '@omne-harness/assembly-cordis/cordis'
import type {
  DrainOutcome,
  HandleOutcome,
  HostFilesReport,
  LifecycleHandle,
  LifecyclePhase,
  RowId,
  RowManifest,
  ShutdownReport,
  StopResult,
  TelemetryShutdownReport,
} from './types.ts'

export type RowSupervision = RowSupervisor<LifecycleHandle, ShutdownReport>

type LifecycleEntry = HandleEntry<LifecycleHandle>

export type { ShutdownReport }

export type Timer = Readonly<{ promise: Promise<void>; cancel: () => void }>

export type ShutdownClock = Readonly<{
  now: () => number
  after: (ms: number) => Timer
}>

export const monotonicClock: ShutdownClock = {
  now: () =>
    /* wall-clock: operation-timing -- 关闭期限的单调时钟读数，不是领域时间 */ performance.now(),
  after(ms) {
    let timer: ReturnType<typeof setTimeout> | undefined
    const promise = new Promise<void>(resolve => {
      timer = setTimeout(resolve, Math.max(0, ms))
    })
    return { promise, cancel: () => clearTimeout(timer) }
  },
}

export type ShutdownAction =
  | 'drain-call'
  | 'stop-call'
  | 'report-fixed'
  | 'report-settled-call'
  | 'dispose-root'
  | 'telemetry-close'
  | 'late-result'
  | 'diagnostic'

export type ShutdownRecord = Readonly<{
  kind: 'shutdown-step'
  seq: number
  phase: LifecyclePhase | null
  row: RowId | null
  action: ShutdownAction
  detail?: string
}>

export type ShutdownOptions = Readonly<{
  log?: (record: ShutdownRecord) => void
  stopsFirst?: ReadonlyMap<RowId, readonly RowId[]>
  drainMs?: number
  /** Work done in the step of `row`: after whoever needs that row has ended, before what it needs stops. */
  withRow?: Readonly<{ row: RowId; run: () => Promise<HostFilesReport> }>
  afterStorage?: (deadlineMonotonicMs: number) => Promise<TelemetryShutdownReport>
  disposeRoot?: () => Promise<unknown> | unknown
  /** How long the root disposal may take. Past it the shutdown goes on without it; absent, it waits. */
  disposeRootMs?: number
  /** The rows not disposed yet, asked when the root disposal passed its deadline. */
  undisposedRows?: () => readonly string[]
  rootStuck?: (rows: readonly string[]) => void
}>

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function stopPredecessors(
  rows: readonly Readonly<{ row: Readonly<{ id: RowId }>; manifest: RowManifest }>[],
): ReadonlyMap<RowId, readonly RowId[]> {
  const declared = rows.map(({ row, manifest }) => ({
    name: row.id,
    provides: manifest.provides,
    injects: manifest.injects,
  }))
  return stopsAfter(edgesOf(declared)) as ReadonlyMap<RowId, readonly RowId[]>
}

export function runShutdown(
  registry: RowSupervision,
  expected: ReadonlyMap<RowId, LifecyclePhase>,
  deadlineMs: number,
  clock: ShutdownClock,
  options: ShutdownOptions = {},
): Promise<ShutdownReport> {
  return registry.once(() => execute(registry, expected, deadlineMs, clock, options))
}

type StepLog = (
  action: ShutdownAction,
  phase: LifecyclePhase | null,
  row: RowId | null,
  detail?: string,
) => void

type StopBudget = Readonly<{ deadline: number; clock: ShutdownClock; log: StepLog }>

type Frozen = Readonly<{
  live: ReadonlyMap<RowId, LifecycleEntry>
  withdrawn: ReadonlyMap<RowId, WithdrawnEntry<LifecycleHandle>>
}>

function numberedLog(sink: ShutdownOptions['log']): StepLog {
  let seq = 0
  return (action, phase, row, detail) => {
    const record: ShutdownRecord = {
      kind: 'shutdown-step',
      seq: ++seq,
      phase,
      row,
      action,
      ...(detail === undefined ? {} : { detail }),
    }
    sink?.(record)
  }
}

async function stopOne(
  entry: LifecycleEntry,
  phase: LifecyclePhase,
  row: RowId,
  { deadline, clock, log }: StopBudget,
): Promise<HandleOutcome> {
  entry.stopCalled = true
  log('stop-call', phase, row)
  const stopped: Promise<StopResult> = Promise.resolve()
    .then(() => entry.handle.stop(deadline))
    .catch((error: unknown): StopResult => ({ kind: 'failed', detail: messageOf(error) }))
  const timer = clock.after(deadline - clock.now())
  const winner = await Promise.race([
    stopped.then(result => ({ result })),
    timer.promise.then(() => null),
  ])
  if (winner !== null) {
    timer.cancel()
    return { row, phase, result: winner.result }
  }
  void stopped.then(late => log('late-result', phase, row, `after deadline: ${late.kind}`))
  return {
    row,
    phase,
    result: {
      kind: 'incomplete',
      detail: `deadline reached before stop settled (D=${deadline})`,
    },
  }
}

async function drainAll(
  frozen: Frozen,
  { deadline, clock, log }: StopBudget,
): Promise<DrainOutcome[]> {
  const draining = [...frozen.live].flatMap(([row, entry]) => {
    const drain = entry.handle.drain
    return drain === undefined ? [] : [{ row, drain, phase: entry.handle.phase }]
  })
  return Promise.all(
    draining.map(async ({ row, drain, phase }): Promise<DrainOutcome> => {
      log('drain-call', phase, row)
      const drained: Promise<StopResult> = Promise.resolve()
        .then(() => drain(deadline))
        .catch((error: unknown): StopResult => ({ kind: 'failed', detail: messageOf(error) }))
      const timer = clock.after(deadline - clock.now())
      const winner = await Promise.race([
        drained.then(result => ({ result })),
        timer.promise.then(() => null),
      ])
      if (winner !== null) {
        timer.cancel()
        return { row, result: winner.result }
      }
      void drained.then(late =>
        log('late-result', phase, row, `drain after deadline: ${late.kind}`),
      )
      return { row, result: { kind: 'incomplete', detail: 'drain deadline reached' } }
    }),
  )
}

async function outcomeOfRow(
  registry: RowSupervision,
  frozen: Frozen,
  phase: LifecyclePhase,
  row: RowId,
  budget: StopBudget,
): Promise<HandleOutcome> {
  const live = frozen.live.get(row)
  if (live !== undefined) {
    const outcome = await stopOne(live, phase, row, budget)
    const failure = registry.startFailure
    if (failure?.row !== row) return outcome
    const stop = outcome.result.kind === 'settled' ? '' : `; stop ${outcome.result.kind}`
    return {
      row,
      phase,
      result: { kind: 'failed', detail: `start failed: ${failure.detail}${stop}` },
    }
  }
  const gone = frozen.withdrawn.get(row)
  if (gone !== undefined) {
    return { row, phase, result: { kind: 'disposed-before-stop', detail: gone.detail } }
  }
  return { row, phase, result: { kind: 'not-registered' } }
}

async function collectAppendix<T>(
  task: () => Promise<T>,
  label: string,
  phase: LifecyclePhase | null,
  { deadline, clock, log }: StopBudget,
  outcomes: Readonly<{ onFailure: () => T; onDeadline: () => T }>,
): Promise<T> {
  const settled = Promise.resolve()
    .then(task)
    .catch((): T => {
      log('diagnostic', phase, null, `${label} failed`)
      return outcomes.onFailure()
    })
  const timer = clock.after(deadline - clock.now())
  const winner = await Promise.race([
    settled.then(value => ({ value })),
    timer.promise.then(() => null),
  ])
  if (winner === null) {
    void settled.then(() => log('late-result', phase, null, `${label} completed after deadline`))
    return outcomes.onDeadline()
  }
  timer.cancel()
  return winner.value
}

const collectHostFiles = (
  run: () => Promise<HostFilesReport>,
  budget: StopBudget,
): Promise<HostFilesReport> =>
  collectAppendix(run, 'host-files maintenance', null, budget, {
    onFailure: () => ({ kind: 'unavailable', diagnostic: 'maintenance-failed' }),
    onDeadline: () => ({ kind: 'unavailable', diagnostic: 'deadline' }),
  })

const collectTelemetry = (
  afterStorage: NonNullable<ShutdownOptions['afterStorage']>,
  budget: StopBudget,
): Promise<TelemetryShutdownReport> => {
  budget.log('telemetry-close', null, null)
  return collectAppendix(() => afterStorage(budget.deadline), 'telemetry close', null, budget, {
    onFailure: () => ({ kind: 'unavailable', diagnostic: 'close-failed' }),
    onDeadline: () => ({ kind: 'unavailable', diagnostic: 'deadline' }),
  })
}

function announceReportSettled(live: Frozen['live'], log: StepLog): void {
  for (const [row, entry] of live) {
    if (entry.handle.assemblyReportSettled === undefined) continue
    log('report-settled-call', entry.handle.phase, row)
    try {
      entry.handle.assemblyReportSettled()
    } catch (error) {
      log('diagnostic', entry.handle.phase, row, `assemblyReportSettled threw: ${messageOf(error)}`)
    }
  }
}

/** Waits for a disposal up to a deadline: 'late' means it had not settled and is left behind. */
export async function disposeWithin(
  dispose: () => Promise<unknown> | unknown,
  deadlineMs: number | undefined,
  clock: ShutdownClock,
): Promise<'done' | 'late'> {
  const disposal = Promise.resolve().then(dispose)
  if (deadlineMs === undefined) return disposal.then(() => 'done')
  const timer = clock.after(deadlineMs)
  const won = await Promise.race([
    disposal.then(() => 'done' as const),
    timer.promise.then(() => 'late' as const),
  ])
  timer.cancel()
  if (won === 'late') disposal.catch(() => {})
  return won
}

async function retireRoot(
  options: ShutdownOptions,
  clock: ShutdownClock,
  log: StepLog,
): Promise<void> {
  const { disposeRoot, disposeRootMs } = options
  if (disposeRoot === undefined) return
  log('dispose-root', null, null)
  try {
    if ((await disposeWithin(disposeRoot, disposeRootMs, clock)) === 'done') return
    const rows = options.undisposedRows?.() ?? []
    const named = rows.length === 0 ? '' : `; not disposed: ${rows.join(', ')}`
    log('diagnostic', null, null, `root disposal did not settle within ${disposeRootMs} ms${named}`)
    options.rootStuck?.(rows)
  } catch (error) {
    log('diagnostic', null, null, `root disposal failed: ${messageOf(error)}`)
  }
}

const ADMISSION: LifecyclePhase = 'entry'

async function stopTheRest(
  rows: readonly (readonly [RowId, LifecyclePhase])[],
  options: ShutdownOptions,
  stop: (row: RowId, phase: LifecyclePhase) => Promise<HandleOutcome>,
  budget: () => StopBudget,
): Promise<Readonly<{ outcomes: HandleOutcome[]; hostFiles: HostFilesReport | undefined }>> {
  const { stopsFirst, withRow } = options
  const phases = new Map(rows)
  const steps = new Set([...phases.keys(), ...(withRow === undefined ? [] : [withRow.row])])
  const settling = new Map<RowId, Promise<HandleOutcome | undefined>>()
  let hostFiles: HostFilesReport | undefined
  const ended = (row: RowId): Promise<HandleOutcome | undefined> => {
    const known = settling.get(row)
    if (known !== undefined) return known
    const first = (stopsFirst?.get(row) ?? []).filter(other => other !== row && steps.has(other))
    const outcome = Promise.all(first.map(ended)).then(async () => {
      const phase = phases.get(row)
      const stopped = phase === undefined ? undefined : await stop(row, phase)
      if (withRow?.row === row) hostFiles = await collectHostFiles(withRow.run, budget())
      return stopped
    })
    settling.set(row, outcome)
    return outcome
  }
  for (const row of steps) void ended(row)
  const outcomes = await Promise.all(settling.values())
  return { outcomes: outcomes.filter(outcome => outcome !== undefined), hostFiles }
}

async function execute(
  registry: RowSupervision,
  expected: ReadonlyMap<RowId, LifecyclePhase>,
  deadlineMs: number,
  clock: ShutdownClock,
  options: ShutdownOptions,
): Promise<ShutdownReport> {
  const log = numberedLog(options.log)
  registry.enterStopping()
  const frozen = registry.freeze() as Frozen
  let budget: StopBudget = { deadline: clock.now() + deadlineMs, clock, log }
  const stop = (row: RowId, phase: LifecyclePhase): Promise<HandleOutcome> =>
    outcomeOfRow(registry, frozen, phase, row, budget)

  // A handle of a row nobody expected is stopped and reported like the others: no row is left running.
  const unexpected = [...frozen.live]
    .filter(([row]) => !expected.has(row))
    .map(([row, entry]) => [row, entry.handle.phase] as const)
  const rows = [...expected, ...unexpected]
  const admission = rows.filter(([, phase]) => phase === ADMISSION)
  const admitted = await Promise.all(admission.map(([row, phase]) => stop(row, phase)))
  let drains: DrainOutcome[] = []
  if (options.drainMs !== undefined) {
    const began = clock.now()
    drains = await drainAll(frozen, { deadline: began + options.drainMs, clock, log })
    budget = { ...budget, deadline: budget.deadline + (clock.now() - began) }
  }
  const rest = await stopTheRest(
    rows.filter(([, phase]) => phase !== ADMISSION),
    options,
    stop,
    () => budget,
  )
  const outcomes = [...admitted, ...rest.outcomes]
  const { hostFiles } = rest
  const telemetry =
    options.afterStorage === undefined
      ? undefined
      : await collectTelemetry(options.afterStorage, budget)

  const report: ShutdownReport = Object.freeze({
    overall:
      outcomes.every(o => o.result.kind === 'settled') &&
      drains.every(d => d.result.kind === 'settled')
        ? 'settled'
        : 'incomplete',
    outcomes: Object.freeze(outcomes),
    ...(drains.length === 0 ? {} : { drains: Object.freeze(drains) }),
    ...(hostFiles === undefined ? {} : { hostFiles: Object.freeze(hostFiles) }),
    ...(telemetry === undefined ? {} : { telemetry: Object.freeze(telemetry) }),
  })
  log('report-fixed', null, null, report.overall)

  announceReportSettled(frozen.live, log)
  await retireRoot(options, clock, log)
  return report
}
