import type { Context, Fiber } from '@deepseek-ai/cordis'
import { succeed } from '@omne-harness/operation-result'
import {
  canonicalDigest,
  createToolDriver,
  type ToolDependencies,
  type ToolLedger,
} from '@omne-harness/tool'
import type { DurableEvidence } from '@omne-harness/tool-contract'
import type {
  ToolDriver,
  ToolInstanceHost,
  ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'
import { createLocalToolResultDelivery } from './result-delivery.ts'
import { createRuntimePublication } from './runtime-publication.ts'
import { waitRuntime, type RuntimeCompositionInput } from './runtime-composition.ts'
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
  progress: string
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
  }>,
) {
  const { settings, dependencies } = input
  const abort = new AbortController()
  const calls = new Map<string, Entry>()
  let completed = 0
  let foreignExecutionRuns = 0
  let unownedRuns = 0
  const delivery = createLocalToolResultDelivery({
    store: settings.store,
    commands: dependencies.commands,
    reads: dependencies.reads,
    resultDelivery: input.resultDelivery,
    identities: dependencies.operationIdentities,
    access: settings.access.guard,
    position: { access: settings.resolveAccess, receiver: input.receiver },
    capacity: settings.capacity,
    // No receiver, or one that answers unavailable: the delivery stays owed, paced and named (R2-D273, R2-D282).
    pacing: {
      initialMs: settings.configuration.driverRetryDelayMs ?? 1000,
      maxMs: Math.max(settings.configuration.driverRetryDelayMs ?? 1000, 60_000),
    },
    warn: message => {
      try {
        input.ctx.logger('tool-executor').warn(message)
      } catch {
        // The context has ended; there is nobody to tell.
      }
    },
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
  const remember = (wake: Wake): boolean => {
    const key = keyOf(wake)
    if (calls.has(key)) return !abort.signal.aborted
    if (abort.signal.aborted || calls.size >= settings.capacity) return false
    calls.set(key, {
      wake,
      publication: null,
      fiber: null,
      started: false,
      retiring: false,
      running: false,
      complete: false,
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
  const retire = async (wake: Wake, entry: Entry): Promise<void> => {
    const key = keyOf(wake)
    if (!entry.complete || entry.running || entry.retiring || calls.get(key) !== entry) return
    entry.retiring = true
    entry.publication?.close('closed')
    try {
      await entry.fiber?.dispose()
    } catch {
      entry.retiring = false
      entry.complete = false
      input.ctx
        .logger('tool-executor')
        .warn('Instance observation cleanup is unconfirmed; the local index is retained.')
      return
    }
    if (calls.get(key) === entry) {
      calls.delete(key)
      delivery.release(wake)
    }
    completed += 1
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
      const entry = calls.get(keyOf(step))
      if (entry === undefined) {
        unownedRuns += 1
        return
      }
      if (abort.signal.aborted) return
      if (entry.retiring) return
      entry.running = true
      try {
        const before = await dependencies.commands.loadRecovery(step)
        if ('failure' in before) return
        entry.started = true
        // A new executor cannot attach an old execution by resolving the latest providers.
        if (before.ok.execution !== null && before.ok.execution.instance !== step.instance) {
          foreignExecutionRuns += 1
          if (calls.get(keyOf(step)) === entry) {
            calls.delete(keyOf(step))
            delivery.release(step)
          }
          return
        }
        const progress = await driver.advance(step)
        entry.progress =
          progress.kind === 'failed'
            ? `${progress.kind}/${progress.failure.kind}${progress.failure.kind === 'unavailable' ? `/${progress.failure.dependency}` : ''}`
            : progress.kind
        if (abort.signal.aborted) return
        const after = await dependencies.commands.loadRecovery(step)
        if ('failure' in after) return
        publish(step, after, entry)
        await entry.publication?.refresh(step, after.ok.admission)
        deliver(step, entry, after)
      } finally {
        entry.running = false
        void retire(step, entry)
      }
    },
  }
  const installed = dependencies.instances.install({
    run: async step => {
      await waitRuntime(() => advancing.run(step), abort.signal)
    },
  })
  const retryMs = settings.configuration.driverRetryDelayMs ?? 1000
  // Live calls only: a complete call has nothing left to drive and retires on its own.
  const timer = setInterval(() => {
    for (const entry of calls.values()) {
      if (entry.retiring || entry.complete) continue
      void dependencies.instances.schedule(entry.wake).catch(() => undefined)
    }
  }, retryMs)
  timer.unref()
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
      foreignExecutionRuns,
      unownedRuns,
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
