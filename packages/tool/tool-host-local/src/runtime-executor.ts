import type { Context, Fiber } from '@deepseek-ai/cordis'
import { succeed } from '@omne-harness/operation-result'
import {
  canonicalDigest,
  createToolDriver,
  type ToolDependencies,
  type ToolLedger,
  type ToolLedgerRecovery,
} from '@omne-harness/tool'
import type { DurableEvidence, ToolInstanceId } from '@omne-harness/tool-contract'
import type {
  ToolDriver,
  ToolInstanceHost,
  ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'
import { owesWork, waitsForPerson } from './call-dormancy.ts'
import { attachCall } from './call-liveness.ts'
import { createLostExecutions, type LostExecutionsInput } from './lost-execution.ts'
import { createRecoveryScans } from './recovery-scans.ts'
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
  complete: boolean
  dormant: boolean
  progress: string
}

function drivenLater(progress: string): boolean {
  return (
    progress === 'blocked' || progress === 'yielded' || progress.startsWith('failed/unavailable')
  )
}

const RESCAN_MS = 60_000

function logTo(ctx: Context): (level: 'warn' | 'info', message: string) => void {
  return (level, message) => {
    try {
      ctx.logger('tool-executor')[level](message)
    } catch {}
  }
}

type ExecutorInput = Readonly<{
  ctx: Context
  settings: RuntimeCompositionInput
  dependencies: ToolDependencies<unknown, ToolMessageContentBlock, ToolEnvironmentValue>
  resultDelivery: ToolLedger<unknown, ToolMessageContentBlock>['delivery']
  receiver: Parameters<
    typeof createLocalToolResultDelivery<unknown, ToolMessageContentBlock>
  >[0]['position']['receiver']
  recovery: ToolLedgerRecovery
  instance(): ToolInstanceId | null
  maintenance: LostExecutionsInput['maintenance']
}>

const AT_REST: ReadonlySet<string> = new Set(['ended', 'not-started', 'lost'])

export function createRuntimeExecutor(input: ExecutorInput) {
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
  const lost = createLostExecutions(input, step => driver.later(step))
  const keyOf = (wake: Wake) => canonicalDigest([wake.tenant, wake.call])
  // `scans` is built below; `remember` reaches it only when it is called, after construction.
  const remember = (wake: Wake, purpose: RuntimeCallPurpose = 'execute'): boolean => {
    const key = keyOf(wake)
    if (calls.has(key)) return !abort.signal.aborted
    if (abort.signal.aborted || calls.size >= settings.capacity) return false
    scans.registered(wake)
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
  const scans = createRecoveryScans({
    startup: input.recovery.scan,
    pending: scan => settings.store.scanPending(scan),
    rescanMs: settings.recoveryRescanMs ?? RESCAN_MS,
    remember,
    schedule: call => void dependencies.instances.schedule(call).catch(() => undefined),
    warn: message => executorLog('warn', message),
    signal: abort.signal,
  })
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
      if (entry.complete) scans.ended(wake)
      scans.roomMade()
    }
    if (entry.complete) completed += 1
    else dormantExits += 1
  }
  const entryOf = async (
    step: Parameters<ToolDriver<unknown>['run']>[0],
  ): Promise<Entry | null> => {
    const known = calls.get(keyOf(step))
    if (known !== undefined) return known
    const recovery = await dependencies.commands.loadRecovery(step)
    if ('failure' in recovery) return null
    if (!owesWork(recovery.ok)) {
      if (recovery.ok.state.phase === 'settled') scans.ended(step)
      return null
    }
    if (remember(step)) {
      reentries += 1
      return calls.get(keyOf(step)) ?? null
    }
    scans.wanted(step)
    return null
  }
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
        if (!AT_REST.has(execution.kind)) return
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
        if ('failure' in before) {
          if (before.failure.kind === 'unavailable') {
            entry.progress = `failed/unavailable/${before.failure.dependency}`
            driver.later(step)
          }
          return
        }
        entry.started = true
        const forget = () => {
          foreignExecutionRuns += 1
          if (calls.get(keyOf(step)) !== entry) return
          calls.delete(keyOf(step))
          delivery.release(step)
          scans.roomMade()
        }
        if (await lost.handled(step, before.ok, entry, forget)) return
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
        // A dormant call leaves before its run returns: the next run finds it gone and reloads it
        // from the ledger, so a hint that came meanwhile is not lost.
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
  const retryMs = settings.configuration.driverRetryDelayMs ?? 1000
  const timer = setInterval(() => {
    for (const entry of calls.values()) {
      if (entry.retiring || entry.complete || entry.dormant || drivenLater(entry.progress)) continue
      void dependencies.instances.schedule(entry.wake).catch(() => undefined)
    }
  }, retryMs)
  timer.unref()
  scans.start()
  let closing: Promise<void> | null = null
  return {
    remember,
    knows: (wake: Wake) => calls.has(keyOf(wake)),
    attach: (wake: Wake) => attachCall(input, remember, wake),
    rejectAdmission(wake: Wake) {
      const entry = calls.get(keyOf(wake))
      if (entry === undefined || entry.started) return
      calls.delete(keyOf(wake))
      scans.ended(wake)
      scans.roomMade()
    },
    live: () => !abort.signal.aborted,
    diagnostics: () => {
      const scanned = scans.diagnostics()
      return {
        knownCalls: calls.size,
        pacedDeliveries: delivery.pacedEntries(),
        completed,
        dormantExits,
        reentries,
        foreignExecutionRuns,
        unownedRuns,
        recoveryScan: scanned.startup,
        recoveredCalls: scanned.recovered,
        owedTenants: scanned.owedTenants,
        progress: [...new Set([...calls.values()].map(entry => entry.progress))],
        retired: abort.signal.aborted,
      }
    },
    close(): Promise<void> {
      if (closing !== null) return closing
      abort.abort()
      clearInterval(timer)
      scans.close()
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
