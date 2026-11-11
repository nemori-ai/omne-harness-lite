// 关闭协调器（s0-spec-r2 §9「步骤」「阶段规则」）。全部阶段共用截止时间 D；句柄超时记 incomplete，
// 抛出记 failed，协调者继续下一阶段。四个阶段之后是入口交来的遥测关闭步骤，报告确定后才调用
// `assemblyReportSettled()`，之后才撤除根。
import type { LifecycleEntry, LifecycleRegistry } from './lifecycle.ts'
import { PHASE_ORDER } from './lifecycle.ts'
import type {
  HandleOutcome,
  HostFilesReport,
  LifecyclePhase,
  RowId,
  ShutdownReport,
  StopResult,
  TelemetryShutdownReport,
} from './types.ts'

export type { ShutdownReport }

export type Timer = Readonly<{ promise: Promise<void>; cancel: () => void }>

export type ShutdownClock = Readonly<{
  /** 单调时钟，毫秒。 */
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
  | 'stop-call'
  | 'report-fixed'
  | 'report-settled-call'
  | 'dispose-root'
  | 'telemetry-close' // 存储阶段之后的遥测关闭步骤
  | 'late-result' // 报告确定前后才结束的句柄：只写诊断
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
  /** Entry-owned host retirement and final maintenance, bounded only for report collection. */
  afterBusiness?: () => Promise<HostFilesReport>
  /** Entry-owned telemetry close after the storage phase, with the deadline D; bounded only for the report. */
  afterStorage?: (deadlineMonotonicMs: number) => Promise<TelemetryShutdownReport>
  /** 步骤 9：撤除 Cordis 根。结果只进诊断。 */
  disposeRoot?: () => Promise<unknown> | unknown
}>

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function runShutdown(
  registry: LifecycleRegistry,
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

/** What every stop step shares: the one deadline D, its clock and the numbered step log. */
type StopBudget = Readonly<{ deadline: number; clock: ShutdownClock; log: StepLog }>

type Frozen = ReturnType<LifecycleRegistry['freeze']>

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

/** One expected row: stop the live handle, or say why there was nothing to stop. */
async function outcomeOfRow(
  registry: LifecycleRegistry,
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
    // 启动期抛出的句柄仍收到 stop；报告记 failed，并保留 stop 的结果作诊断。
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

/**
 * An entry-owned appendix of the report (host-files maintenance, telemetry close), bounded by D only
 * for the report: a throw is a diagnostic and `onFailure`, the deadline is `onDeadline` and a late
 * completion is a diagnostic. The task itself goes on; the root disposer waits for it.
 */
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
  afterBusiness: () => Promise<HostFilesReport>,
  phase: LifecyclePhase,
  budget: StopBudget,
): Promise<HostFilesReport> =>
  collectAppendix(afterBusiness, 'host-files maintenance', phase, budget, {
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

/** After the report is fixed, each live handle that asked for it is told so. A throw is a diagnostic. */
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

async function retireRoot(dispose: ShutdownOptions['disposeRoot'], log: StepLog): Promise<void> {
  if (dispose === undefined) return
  log('dispose-root', null, null)
  try {
    await dispose()
  } catch (error) {
    log('diagnostic', null, null, `root disposal failed: ${messageOf(error)}`)
  }
}

async function execute(
  registry: LifecycleRegistry,
  expected: ReadonlyMap<RowId, LifecyclePhase>,
  deadlineMs: number,
  clock: ShutdownClock,
  options: ShutdownOptions,
): Promise<ShutdownReport> {
  const log = numberedLog(options.log)
  registry.enterStopping()
  const frozen = registry.freeze()
  const budget: StopBudget = { deadline: clock.now() + deadlineMs, clock, log }

  const outcomes: HandleOutcome[] = []
  let hostFiles: HostFilesReport | undefined
  for (const phase of PHASE_ORDER) {
    const rows = [...expected].filter(([, expectedPhase]) => expectedPhase === phase)
    const phaseOutcomes = await Promise.all(
      rows.map(([row]) => outcomeOfRow(registry, frozen, phase, row, budget)),
    )
    outcomes.push(...phaseOutcomes)
    if (phase === 'business' && options.afterBusiness !== undefined) {
      hostFiles = await collectHostFiles(options.afterBusiness, phase, budget)
    }
  }
  // Storage has stopped, so nothing of the tree writes diagnostics any more: close telemetry now.
  const telemetry =
    options.afterStorage === undefined
      ? undefined
      : await collectTelemetry(options.afterStorage, budget)

  const report: ShutdownReport = Object.freeze({
    overall: outcomes.every(o => o.result.kind === 'settled') ? 'settled' : 'incomplete',
    outcomes: Object.freeze(outcomes),
    ...(hostFiles === undefined ? {} : { hostFiles: Object.freeze(hostFiles) }),
    ...(telemetry === undefined ? {} : { telemetry: Object.freeze(telemetry) }),
  })
  log('report-fixed', null, null, report.overall)

  announceReportSettled(frozen.live, log)
  await retireRoot(options.disposeRoot, log)
  return report
}
