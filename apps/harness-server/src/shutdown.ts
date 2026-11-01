// 关闭协调器（s0-spec-r2 §9「步骤」「阶段规则」）。全部阶段共用截止时间 D；句柄超时记 incomplete，
// 抛出记 failed，协调者继续下一阶段。报告确定后才调用 `assemblyReportSettled()`，之后才撤除根。
import type { LifecycleEntry, LifecycleRegistry } from './lifecycle.ts'
import { PHASE_ORDER } from './lifecycle.ts'
import type { HandleOutcome, LifecyclePhase, RowId, ShutdownReport, StopResult } from './types.ts'

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

async function execute(
  registry: LifecycleRegistry,
  expected: ReadonlyMap<RowId, LifecyclePhase>,
  deadlineMs: number,
  clock: ShutdownClock,
  options: ShutdownOptions,
): Promise<ShutdownReport> {
  let seq = 0
  const log = (
    action: ShutdownAction,
    phase: LifecyclePhase | null,
    row: RowId | null,
    detail?: string,
  ) => {
    const record: ShutdownRecord = {
      kind: 'shutdown-step',
      seq: ++seq,
      phase,
      row,
      action,
      ...(detail === undefined ? {} : { detail }),
    }
    options.log?.(record)
  }

  registry.enterStopping()
  const frozen = registry.freeze()
  const deadline = clock.now() + deadlineMs

  const stopOne = async (
    entry: LifecycleEntry,
    phase: LifecyclePhase,
    row: RowId,
  ): Promise<HandleOutcome> => {
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

  const outcomes: HandleOutcome[] = []
  for (const phase of PHASE_ORDER) {
    const rows = [...expected].filter(([, expectedPhase]) => expectedPhase === phase)
    const phaseOutcomes = await Promise.all(
      rows.map(async ([row]): Promise<HandleOutcome> => {
        const live = frozen.live.get(row)
        if (live !== undefined) {
          const outcome = await stopOne(live, phase, row)
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
      }),
    )
    outcomes.push(...phaseOutcomes)
  }

  const report: ShutdownReport = Object.freeze({
    overall: outcomes.every(o => o.result.kind === 'settled') ? 'settled' : 'incomplete',
    outcomes: Object.freeze(outcomes),
  })
  log('report-fixed', null, null, report.overall)

  for (const [row, entry] of frozen.live) {
    if (entry.handle.assemblyReportSettled === undefined) continue
    log('report-settled-call', entry.handle.phase, row)
    try {
      entry.handle.assemblyReportSettled()
    } catch (error) {
      log('diagnostic', entry.handle.phase, row, `assemblyReportSettled threw: ${messageOf(error)}`)
    }
  }

  if (options.disposeRoot !== undefined) {
    log('dispose-root', null, null)
    try {
      await options.disposeRoot()
    } catch (error) {
      log('diagnostic', null, null, `root disposal failed: ${messageOf(error)}`)
    }
  }
  return report
}
