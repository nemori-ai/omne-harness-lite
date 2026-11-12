import type { Context, Fiber } from '@deepseek-ai/cordis'
import { succeed } from '@omne-harness/operation-result'
import {
  canonicalDigest,
  createToolDriver,
  type PendingCall,
  type ToolDependencies,
  type ToolLedger,
  type ToolLedgerRecovery,
} from '@omne-harness/tool'
import type { DurableEvidence } from '@omne-harness/tool-contract'
import type {
  ToolDriver,
  ToolInstanceHost,
  ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'
import { owesWork, waitsForPerson } from './call-dormancy.ts'
import { createLocalToolResultDelivery } from './result-delivery.ts'
import { createRuntimePublication } from './runtime-publication.ts'
import { createRunStopLog } from './run-stop-log.ts'
import {
  waitRuntime,
  type RuntimeCallPurpose,
  type RuntimeCompositionInput,
} from './runtime-composition.ts'
import type { ToolEnvironmentValue } from './author-environment.ts'

type Wake = Parameters<ToolInstanceHost<unknown>['schedule']>[0]
type Publication = ReturnType<typeof createRuntimePublication>
type Recovered = Extract<
  Awaited<
    ReturnType<
      ToolDependencies<
        unknown,
        ToolMessageContentBlock,
        ToolEnvironmentValue
      >['commands']['loadRecovery']
    >
  >,
  { ok: unknown }
>
type Entry = {
  wake: Wake
  readonly purpose: RuntimeCallPurpose
  publication: Publication | null
  fiber: Fiber | null
  started: boolean
  retiring: boolean
  running: boolean
  /**
   * Judged from a fresh recovery after a delivery outcome: settled, no pending task, delivery
   * done. A complete entry is not rescheduled and retires once no run is in progress.
   */
  complete: boolean
  /**
   * Judged after a run that was idle: the call is suspended on a wait and owes nothing now. A
   * dormant entry leaves the table once no run is in progress; a hint, a run the instance host
   * queued or the recovery scan brings the call back (model DormantCalls).
   */
  dormant: boolean
  progress: string
}

/** How many timer ticks pass before a finished recovery scan is armed again. */
const RESCAN_TICKS = 60

/** 启动扫描每次向账本要的一页调用数。 */
const RECOVERY_PAGE = 100

/** 原执行可能仍在旧实例里运行的阶段：新实例不接上它，也不重新启动它。 */
const POSSIBLY_LIVE: ReadonlySet<string> = new Set(['starting', 'live', 'unknown'])

/**
 * 启动扫描的进度。`waiting` 还有页没读完（上次读不到，或内存表已满），定时器下一拍从 `after` 接着读；
 * `done` 已读完；`unsupported` 账本或记录仓不能扫描，不再重试。
 */
type RecoveryScan = {
  state: 'waiting' | 'running' | 'done' | 'unsupported'
  after: PendingCall | null
  recovered: number
  /** 上一次扫描以读不到或抛出结束：连续失败只写一条 warn。 */
  failing: boolean
  /** 上一次扫描停在内存表已满上：一直满着只写一条 warn。 */
  full: boolean
}

function logTo(ctx: Context): (level: 'warn' | 'info', message: string) => void {
  return (level, message) => {
    try {
      ctx.logger('tool-executor')[level](message)
    } catch {
      // The context has ended; there is nobody to tell.
    }
  }
}

export function createRuntimeExecutor(
  input: Readonly<{
    ctx: Context
    settings: RuntimeCompositionInput
    dependencies: ToolDependencies<unknown, ToolMessageContentBlock, ToolEnvironmentValue>
    resultDelivery: ToolLedger<unknown, ToolMessageContentBlock>['delivery']
    receiver: Parameters<
      typeof createLocalToolResultDelivery<unknown, ToolMessageContentBlock>
    >[0]['position']['receiver']
    /** 账本的受信恢复扫描：执行器启动时用它找回有待推进工作的旧调用。 */
    recovery: ToolLedgerRecovery
  }>,
) {
  const { settings, dependencies } = input
  const abort = new AbortController()
  const calls = new Map<string, Entry>()
  const executorLog = logTo(input.ctx)
  let completed = 0
  let foreignExecutionRuns = 0
  let unownedRuns = 0
  let dormantExits = 0
  let reentries = 0
  const delivery = createLocalToolResultDelivery({
    store: settings.store,
    commands: dependencies.commands,
    reads: dependencies.reads,
    resultDelivery: input.resultDelivery,
    identities: dependencies.operationIdentities,
    access: settings.access.guard,
    position: { access: settings.resolveAccess, receiver: input.receiver },
    forwardedCopies: settings.sources.releaseReceivedCopies,
    capacity: settings.capacity,
    // No receiver, or one that answers unavailable: the delivery stays owed, paced and named (R2-D273, R2-D282).
    pacing: {
      initialMs: settings.configuration.driverRetryDelayMs ?? 1000,
      maxMs: Math.max(settings.configuration.driverRetryDelayMs ?? 1000, 60_000),
    },
    warn: message => executorLog('warn', message),
    async accountAtFreeze(access) {
      const account = await dependencies.reads.account(access)
      return 'failure' in account &&
        account.failure.kind === 'invalid' &&
        account.failure.field === 'call' &&
        account.failure.reason === 'no-account'
        ? succeed(null)
        : account
    },
  })
  const driver = createToolDriver(dependencies, {
    stepsPerRun: settings.configuration.driverStepsPerRun ?? 16,
    retryDelayMs: settings.configuration.driverRetryDelayMs ?? 1000,
  })
  const keyOf = (wake: Wake) => canonicalDigest([wake.tenant, wake.call])
  const remember = (wake: Wake, purpose: RuntimeCallPurpose = 'execute'): boolean => {
    const key = keyOf(wake)
    if (calls.has(key)) return !abort.signal.aborted
    if (abort.signal.aborted || calls.size >= settings.capacity) return false
    calls.set(key, {
      wake,
      purpose,
      publication: null,
      fiber: null,
      started: false,
      retiring: false,
      running: false,
      complete: false,
      dormant: false,
      progress: 'not-run',
    })
    return true
  }
  const publish = (
    step: Parameters<ToolDriver<unknown>['run']>[0],
    recovery: Recovered,
    entry: Entry,
  ) => {
    const original = recovery.ok
    if (
      original.execution === null ||
      original.execution.instance !== step.instance ||
      original.execution.call !== step.call ||
      canonicalDigest(original.execution.tenant) !== canonicalDigest(step.tenant) ||
      entry.fiber !== null ||
      !['live', 'ended'].includes(original.state.execution.kind)
    )
      return
    const execution = { ...original.execution, tenant: step.tenant }
    const authority: DurableEvidence = original.state.source
    entry.fiber = input.ctx.plugin({
      name: `tool-instance-${canonicalDigest(execution)}`,
      inject: ['toolInstances', 'toolPublicationAuthority'],
      apply(ctx: Context) {
        const lifetime = new AbortController()
        const signal = AbortSignal.any([abort.signal, lifetime.signal])
        const publication = createRuntimePublication({
          execution,
          access: settings.access.guard,
          store: settings.store,
          capacity: settings.observersPerCall,
          bufferBytes: settings.configuration.observerBufferBytes,
          bufferFrames: settings.observerQueueFrames,
          residenceMs: settings.observerResidenceMs,
        })
        entry.publication = publication
        let receipt:
          | Extract<
              Awaited<ReturnType<typeof dependencies.instances.publish>>,
              { ok: unknown }
            >['ok']
          | null = null
        ctx.effect(() => async () => {
          lifetime.abort()
          publication.close('stale-instance')
          if (entry.publication === publication) entry.publication = null
          if (receipt !== null) await dependencies.instances.withdraw(receipt)
        })
        const connect = async () => {
          if (
            (await waitRuntime(() => publication.refresh(step, original.admission), signal)) ===
              null ||
            signal.aborted
          )
            return
          const published = await dependencies.instances.publish(execution, publication.handle)
          if ('failure' in published) throw new Error('The instance publication is unavailable.')
          receipt = published.ok
          if (signal.aborted) {
            await dependencies.instances.withdraw(receipt)
            return
          }
          const registered = await ctx.toolInstances.register({
            publication: [execution, publication.handle],
            authority,
          })
          if ('failure' in registered) throw new Error('The directory publication is unavailable.')
        }
        void connect()
          .catch(async () => {
            publication.close('stale-instance')
            if (receipt !== null) await dependencies.instances.withdraw(receipt)
            if (lifetime.signal.aborted) return
            ctx
              .logger('tool-executor')
              .warn('Instance publication failed; the original call remains scheduled.')
            if (entry.fiber === ctx.fiber) entry.fiber = null
            await ctx.fiber.dispose()
          })
          .catch(() =>
            ctx
              .logger('tool-executor')
              .warn('Publication cleanup remains unconfirmed; error text is withheld.'),
          )
      },
    })
  }
  /**
   * Retires a complete entry once no run is in progress. The delivery outcome and the end of
   * every run both call it, so the retirement does not depend on which of the two comes last
   * (R2-D164). A failed cleanup keeps the entry and lets a later outcome judge it again.
   */
  const stops = createRunStopLog({
    warn: message => executorLog('warn', message),
    info: message => executorLog('info', message),
  })
  const retire = async (wake: Wake, entry: Entry): Promise<void> => {
    const key = keyOf(wake)
    const leaving = entry.complete || entry.dormant
    if (!leaving || entry.running || entry.retiring || calls.get(key) !== entry) return
    entry.retiring = true
    entry.publication?.close('closed')
    try {
      await entry.fiber?.dispose()
    } catch {
      entry.retiring = false
      entry.complete = false
      entry.dormant = false
      input.ctx
        .logger('tool-executor')
        .warn('Instance observation cleanup is unconfirmed; the local index is retained.')
      return
    }
    if (calls.get(key) === entry) {
      calls.delete(key)
      stops.forget(key)
      delivery.release(wake)
    }
    if (entry.complete) completed += 1
    else dormantExits += 1
  }
  /**
   * The entry of a run. A call the table holds runs under its entry. A call it does not hold is a
   * dormant call that a hint or a late run woke: it comes back when the ledger shows work of it
   * and the table has room. With no room the recovery scan is armed again and finds it later.
   */
  const entryOf = async (
    step: Parameters<ToolDriver<unknown>['run']>[0],
  ): Promise<Entry | null> => {
    const known = calls.get(keyOf(step))
    if (known !== undefined) return known
    const recovery = await dependencies.commands.loadRecovery(step)
    if ('failure' in recovery || !owesWork(recovery.ok)) return null
    if (remember(step)) {
      reentries += 1
      return calls.get(keyOf(step)) ?? null
    }
    rearmScan()
    return null
  }
  /**
   * Drives the delivery of the call and judges the outcome. The delivery worker owns its own
   * wait; it never occupies the host's driver queue. A settled call whose delivery is done and
   * whose fresh recovery shows nothing pending is complete: it retires once no run is in progress.
   */
  const deliver = (
    step: Parameters<ToolDriver<unknown>['run']>[0],
    entry: Entry,
    after: Recovered,
  ): void => {
    void delivery
      .drive({ ...step, signal: abort.signal })
      .then(async delivered => {
        if ('failure' in delivered || delivered.ok.pending !== 0) return
        if (after.ok.state.phase !== 'settled') return
        const current = await dependencies.commands.loadRecovery(step)
        if ('failure' in current || calls.get(keyOf(step)) !== entry) return
        const { execution } = current.ok.state
        if (execution.kind !== 'ended' && execution.kind !== 'not-started') return
        if (current.ok.tasks.some(task => task.state === 'pending')) return
        entry.complete = true
        await retire(step, entry)
      })
      .catch(() => undefined)
  }
  const advancing: ToolDriver<unknown> = {
    async run(step) {
      if (abort.signal.aborted) return
      const entry = await entryOf(step)
      if (entry === null) {
        unownedRuns += 1
        return
      }
      if (abort.signal.aborted) return
      if (entry.retiring) return
      entry.dormant = false
      entry.running = true
      try {
        const before = await dependencies.commands.loadRecovery(step)
        if ('failure' in before) return
        entry.started = true
        // A new executor cannot attach an old execution by resolving the latest providers. It
        // lets a call go only when the execution of the current segment can still run in an old
        // instance; the start record of the segment names its owner. This instance advances a
        // call that is suspended, ended or never started, or whose current segment it prepared.
        const owner = before.ok.start?.execution.instance ?? before.ok.execution?.instance
        if (
          owner !== undefined &&
          owner !== step.instance &&
          POSSIBLY_LIVE.has(before.ok.state.execution.kind)
        ) {
          foreignExecutionRuns += 1
          if (calls.get(keyOf(step)) === entry) {
            calls.delete(keyOf(step))
            delivery.release(step)
          }
          return
        }
        // A saved final can release an unused writer while its fragment provider is unavailable.
        const progress = await driver.advance(step)
        stops.stopped(keyOf(step), step.call, progress)
        entry.progress =
          progress.kind === 'failed'
            ? `${progress.kind}/${progress.failure.kind}${progress.failure.kind === 'unavailable' ? `/${progress.failure.dependency}` : ''}`
            : progress.kind
        if (abort.signal.aborted) return
        const after = await dependencies.commands.loadRecovery(step)
        if ('failure' in after) return
        if (progress.kind === 'idle' && waitsForPerson(after.ok)) {
          entry.dormant = true
          return
        }
        publish(step, after, entry)
        await entry.publication?.refresh(step, after.ok.admission)
        deliver(step, entry, after)
      } finally {
        entry.running = false
        // A dormant call leaves before its run returns: the run the host starts next finds the
        // call gone and takes it back from the ledger, so a hint that came meanwhile is not lost.
        const dormant = entry.dormant
        const left = retire(step, entry)
        if (dormant) await left
      }
    },
  }
  const installed = dependencies.instances.install({
    run: async step => {
      await waitRuntime(() => advancing.run(step), abort.signal)
    },
  })
  const warn = (message: string) => executorLog('warn', message)
  const scan: RecoveryScan = {
    state: 'waiting',
    after: null,
    recovered: 0,
    failing: false,
    full: false,
  }
  const scanFailed = (message: string) => {
    if (!scan.failing) warn(message)
    scan.failing = true
  }
  /**
   * Arms a finished scan again, from the start: a dormant call whose hint was lost, or that found
   * no room when its hint came, is found by its pending marker.
   */
  function rearmScan(): void {
    if (scan.state !== 'done') return
    scan.state = 'waiting'
    scan.after = null
  }
  /**
   * 启动扫描（契约 P09 recover）：按待办标记分页找回有待推进工作的调用，记入内存表并调度，驱动按
   * 调用当前的阶段推进。内存表满时停在当前游标，等有调用退场后的下一拍接着读；读不到时同样等下一拍。
   * 扫描只给出调用身份，每次运行仍由实例宿主按 `recover` 资格解析访问。
   */
  const sweep = async (): Promise<void> => {
    if (scan.state !== 'waiting' || abort.signal.aborted) return
    scan.state = 'running'
    try {
      for (;;) {
        const page = await input.recovery.scan({ after: scan.after, limit: RECOVERY_PAGE })
        if (abort.signal.aborted) return
        if ('failure' in page) {
          if (page.failure.kind === 'unsupported') {
            scan.state = 'unsupported'
            warn('The recovery scan is unsupported; old calls are not taken over.')
          } else scanFailed('The recovery scan is unavailable; it goes on at the next retry.')
          return
        }
        scan.failing = false
        for (const call of page.ok.calls) {
          if (!remember(call)) {
            if (!scan.full)
              warn('The executor is full; the recovery scan goes on when a call retires.')
            scan.full = true
            return
          }
          scan.full = false
          scan.after = call
          scan.recovered += 1
          void dependencies.instances.schedule(call).catch(() => undefined)
        }
        // 下一页从本页最后一个调用之后开始，游标已在上面记下。
        if (page.ok.next === null) {
          scan.state = 'done'
          return
        }
      }
    } catch {
      scanFailed(
        'The recovery scan failed; its error text is withheld. It goes on at the next retry.',
      )
    } finally {
      if (scan.state === 'running') scan.state = 'waiting'
    }
  }
  const retryMs = settings.configuration.driverRetryDelayMs ?? 1000
  // Live calls only: a complete call has nothing left to drive and retires on its own.
  let ticksSinceScan = 0
  const timer = setInterval(() => {
    for (const entry of calls.values()) {
      if (entry.retiring || entry.complete || entry.dormant) continue
      void dependencies.instances.schedule(entry.wake).catch(() => undefined)
    }
    // The long fallback for a lost hint: a finished scan runs again every RESCAN_TICKS ticks.
    ticksSinceScan = scan.state === 'done' ? ticksSinceScan + 1 : 0
    if (ticksSinceScan >= RESCAN_TICKS) rearmScan()
    void sweep()
  }, retryMs)
  timer.unref()
  void sweep()
  let closing: Promise<void> | null = null
  return {
    remember,
    knows: (wake: Wake) => calls.has(keyOf(wake)),
    rejectAdmission(wake: Wake) {
      const entry = calls.get(keyOf(wake))
      if (entry !== undefined && !entry.started) calls.delete(keyOf(wake))
    },
    live: () => !abort.signal.aborted,
    diagnostics: () => ({
      knownCalls: calls.size,
      pacedDeliveries: delivery.pacedEntries(),
      completed,
      dormantExits,
      reentries,
      foreignExecutionRuns,
      unownedRuns,
      recoveryScan: scan.state,
      recoveredCalls: scan.recovered,
      progress: [...new Set([...calls.values()].map(entry => entry.progress))],
      retired: abort.signal.aborted,
    }),
    close(): Promise<void> {
      if (closing !== null) return closing
      abort.abort()
      clearInterval(timer)
      for (const entry of calls.values()) entry.publication?.close('stale-instance')
      closing = Promise.all([
        installed.release(),
        delivery.close(),
        ...[...calls.values()].flatMap(entry =>
          entry.fiber === null ? [] : [entry.fiber.dispose()],
        ),
      ]).then(() => undefined)
      return closing
    },
  }
}
