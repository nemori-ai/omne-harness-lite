import type { Context, Fiber } from '@deepseek-ai/cordis'
import { succeed } from '@omne-harness/operation-result'
import { canonicalDigest, createToolDriver, type ToolDependencies } from '@omne-harness/tool'
import type { DurableEvidence } from '@omne-harness/tool-contract'
import type {
  ToolDriver,
  ToolInstanceHost,
  ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'
import { createLocalToolResultDelivery } from './result-delivery.ts'
import { createRuntimePublication } from './runtime-publication.ts'
import type { LocalToolRuntimeInput } from './runtime-composition.ts'
import type { ToolEnvironmentValue } from './author-environment.ts'

type Wake = Parameters<ToolInstanceHost<unknown>['schedule']>[0]
type Publication = ReturnType<typeof createRuntimePublication>
type Entry = {
  wake: Wake
  publication: Publication | null
  fiber: Fiber | null
  started: boolean
  retiring: boolean
  running: boolean
}

export function createRuntimeExecutor(
  input: Readonly<{
    ctx: Context
    settings: LocalToolRuntimeInput
    dependencies: ToolDependencies<unknown, ToolMessageContentBlock, ToolEnvironmentValue>
    receiver: Parameters<
      typeof createLocalToolResultDelivery<unknown, ToolMessageContentBlock>
    >[0]['position']['receiver']
  }>,
) {
  const { settings, dependencies } = input
  const abort = new AbortController()
  const calls = new Map<string, Entry>()
  let foreignExecutionRuns = 0
  const delivery = createLocalToolResultDelivery({
    store: settings.store,
    commands: dependencies.commands,
    reads: dependencies.reads,
    identities: dependencies.operationIdentities,
    access: settings.access.guard,
    position: { access: settings.resolveAccess, receiver: input.receiver },
    capacity: settings.capacity,
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
    })
    return true
  }
  const publish = (
    step: Parameters<ToolDriver<unknown>['run']>[0],
    recovery: Extract<
      Awaited<ReturnType<typeof dependencies.commands.loadRecovery>>,
      { ok: unknown }
    >,
    entry: Entry,
  ) => {
    const original = recovery.ok
    if (
      original.execution === null ||
      original.execution.instance !== step.instance ||
      entry.fiber !== null ||
      !['live', 'ended'].includes(original.state.execution.kind)
    )
      return
    const execution = original.execution
    const authority: DurableEvidence = original.state.source
    entry.fiber = input.ctx.plugin({
      name: `tool-instance-${canonicalDigest(execution)}`,
      inject: ['toolInstances', 'toolPublicationAuthority'],
      async apply(ctx: Context) {
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
        await publication.refresh(step, original.admission)
        const hostReceipt = await dependencies.instances.publish(execution, publication.handle)
        if ('failure' in hostReceipt)
          throw new Error(`Tool instance publication: ${hostReceipt.failure.kind}`)
        ctx.effect(() => async () => {
          publication.close()
          if (entry.publication === publication) entry.publication = null
          await dependencies.instances.withdraw(hostReceipt.ok)
        })
        const registered = await ctx.toolInstances.register({
          publication: [execution, publication.handle],
          authority,
        })
        if ('failure' in registered)
          throw new Error(`Tool directory publication: ${registered.failure.kind}`)
      },
    })
  }
  const installed = dependencies.instances.install({
    async run(step) {
      if (!remember(step)) return
      const entry = calls.get(keyOf(step))
      if (entry === undefined) return
      if (entry.retiring) return
      entry.running = true
      try {
        const before = await dependencies.commands.loadRecovery(step)
        if ('failure' in before) return
        entry.started = true
        // A new executor cannot attach an old execution by resolving the latest providers.
        if (before.ok.execution !== null && before.ok.execution.instance !== step.instance) {
          foreignExecutionRuns += 1
          if (calls.get(keyOf(step)) === entry) calls.delete(keyOf(step))
          return
        }
        await driver.run(step)
        if (abort.signal.aborted) return
        const after = await dependencies.commands.loadRecovery(step)
        if ('failure' in after) return
        publish(step, after, entry)
        await entry.publication?.refresh(step, after.ok.admission)
        // The delivery worker owns its own wait. It never occupies the host's driver queue.
        void delivery
          .drive({ ...step, signal: abort.signal })
          .then(async delivered => {
            if (
              'failure' in delivered ||
              delivered.ok.pending !== 0 ||
              after.ok.state.phase !== 'settled'
            )
              return
            const current = await dependencies.commands.loadRecovery(step)
            if (
              'ok' in current &&
              current.ok.tasks.length === 0 &&
              calls.get(keyOf(step)) === entry &&
              !entry.running &&
              !entry.retiring
            ) {
              entry.retiring = true
              entry.publication?.close()
              try {
                await entry.fiber?.dispose()
              } catch {
                entry.retiring = false
                input.ctx
                  .logger('tool-executor')
                  .warn('Instance observation cleanup is unconfirmed; the local index is retained.')
                return
              }
              if (calls.get(keyOf(step)) === entry) calls.delete(keyOf(step))
              completed += 1
            }
          })
          .catch(() => undefined)
      } finally {
        entry.running = false
      }
    },
  })
  let completed = 0
  const retryMs = settings.configuration.driverRetryDelayMs ?? 1000
  const timer = setInterval(() => {
    for (const entry of calls.values()) {
      if (entry.retiring) continue
      void dependencies.instances.schedule(entry.wake).catch(() => undefined)
    }
  }, retryMs)
  timer.unref()
  let closing: Promise<void> | null = null
  return {
    remember,
    rejectAdmission(wake: Wake) {
      const entry = calls.get(keyOf(wake))
      if (entry !== undefined && !entry.started) calls.delete(keyOf(wake))
    },
    live: () => !abort.signal.aborted,
    diagnostics: () => ({
      knownCalls: calls.size,
      completed,
      foreignExecutionRuns,
      retired: abort.signal.aborted,
    }),
    close(): Promise<void> {
      if (closing !== null) return closing
      abort.abort()
      clearInterval(timer)
      for (const entry of calls.values()) entry.publication?.close()
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
